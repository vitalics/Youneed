// Error boundary: a throw in render()/lifecycle is contained — it never crashes
// the scheduler batch, routes to an `onError` boundary (which can show a fallback)
// or the global handler, and a looping fallback escalates instead of spinning.
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, define, flushSync, setDefaultScheduler, syncScheduler, setErrorHandler } = await import("../src/dom.ts");
setDefaultScheduler(syncScheduler);

// Capture errors that reach the GLOBAL handler (not handled by an onError hook).
const globalErrors: { error: unknown; phase: string; tag: string }[] = [];
setErrorHandler((error, info) => globalErrors.push({ error, phase: info.phase, tag: info.tag }));

@Component.define()
class Boom extends Component("x-boom") {
  @Component.prop() n = 0;
  render() {
    if (this.n > 0) throw new Error("boom");
    return html`<div>ok ${this.n}</div>`;
  }
}
@Component.define()
class Good extends Component("x-good") {
  @Component.prop() n = 0;
  render() {
    return html`<div class="g">good ${this.n}</div>`;
  }
}
@Component.define()
class Caught extends Component("x-caught") {
  @Component.prop() n = 0;
  failed = false;
  seen: { message: string; phase: string } | undefined;
  render() {
    if (this.failed) return html`<div class="fallback">recovered</div>`;
    if (this.n > 0) throw new Error("kaboom");
    return html`<div>live ${this.n}</div>`;
  }
  onError(error: unknown, info: { phase: string }) {
    this.seen = { message: (error as Error).message, phase: info.phase };
    this.failed = true;
    this.requestUpdate();
  }
}
@Component.define()
class AlwaysBoom extends Component("x-always") {
  @Component.prop() n = 0;
  errorCount = 0;
  render() {
    if (this.n > 0) throw new Error("always");
    return html`<div>x</div>`;
  }
  onError() {
    this.errorCount++;
    this.requestUpdate(); // the fallback render throws too → must NOT loop forever
  }
}
@Component.define()
class MountBoom extends Component("x-mountboom") {
  render() {
    return html`<div class="m">m</div>`;
  }
  onMount() {
    throw new Error("mount fail");
  }
}
@Component.define()
class UnmountBoom extends Component("x-unmountboom") {
  render() {
    return html`<div>u</div>`;
  }
  onUnmount() {
    throw new Error("unmount fail");
  }
}

const root = document.createElement("div");
document.body.appendChild(root);
const mount = <T extends HTMLElement>(tag: string): T => {
  const el = document.createElement(tag) as T;
  root.appendChild(el);
  flushSync();
  return el;
};
const text = (el: HTMLElement) => el.shadowRoot?.textContent?.trim();

// ── batch isolation + global handler ──
const boom = mount<HTMLElement & { n: number }>("x-boom");
const good = mount<HTMLElement & { n: number }>("x-good");
const beforeBoom = globalErrors.length;
boom.n = 1;
good.n = 1;
flushSync(); // boom's render throws; good must still update in the same batch
const boomText = text(boom);
const goodText = text(good);
const boomErr = globalErrors[globalErrors.length - 1];

// ── onError boundary renders a fallback; global handler NOT hit ──
const caught = mount<HTMLElement & { n: number } & { seen?: { message: string; phase: string } }>("x-caught");
const beforeCaught = globalErrors.length;
caught.n = 1;
flushSync();
const caughtText = text(caught as HTMLElement);
const caughtSeen = caught.seen;
const caughtGlobalDelta = globalErrors.length - beforeCaught;

// ── looping fallback escalates (loop guard) ──
const always = mount<HTMLElement & { n: number } & { errorCount: number }>("x-always");
const beforeAlways = globalErrors.length;
always.n = 1;
flushSync(); // must terminate
const alwaysCount = always.errorCount;
const alwaysGlobalDelta = globalErrors.length - beforeAlways;

// ── lifecycle hook errors ──
const beforeMount = globalErrors.length;
const mountBoom = mount<HTMLElement>("x-mountboom");
const mountText = text(mountBoom);
const mountErr = globalErrors[globalErrors.length - 1];

const unmountBoom = mount<HTMLElement>("x-unmountboom");
const beforeUnmount = globalErrors.length;
unmountBoom.remove();
const unmountErr = globalErrors[globalErrors.length - 1];
const unmountDelta = globalErrors.length - beforeUnmount;

class ErrorBoundaryTest extends Test({ name: "error boundary" }) {
  @Test.it("a throwing render is contained, not crashed") contained() {
    expect(boomText).toBe("ok 0"); // last good DOM kept
    expect(boomErr.phase).toBe("update");
    expect(boomErr.tag).toBe("x-boom");
  }
  @Test.it("a sibling still renders in the same batch") isolation() {
    expect(goodText).toBe("good 1");
  }
  @Test.it("onError boundary catches + renders a fallback") fallback() {
    expect(caughtText).toBe("recovered");
    expect(caughtSeen?.message).toBe("kaboom");
    expect(caughtSeen?.phase).toBe("update");
  }
  @Test.it("a handled error does NOT reach the global handler") notGlobal() {
    expect(caughtGlobalDelta).toBe(0);
  }
  @Test.it("a looping fallback escalates once, no infinite loop") loopGuard() {
    expect(alwaysCount).toBe(1); // onError invoked once
    expect(alwaysGlobalDelta).toBe(1); // then escalated to global
  }
  @Test.it("a throwing onMount is reported; component stays mounted") mountHook() {
    expect(mountText).toBe("m");
    expect(mountErr.phase).toBe("mount");
  }
  @Test.it("a throwing onUnmount is reported; teardown still runs") unmountHook() {
    expect(unmountDelta).toBe(1);
    expect(unmountErr.phase).toBe("unmount");
  }
}

await TestApplication().addTests(ErrorBoundaryTest).reporter(new ConsoleReporter()).run();
