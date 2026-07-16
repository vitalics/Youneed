// Run: pnpm --filter @youneed/dom-provider-direction test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { directionProvider, createDirectionStore, directionOf } from "../src/index.ts";

registerDOM();
const { Component, html, flushSync } = await import("@youneed/dom");

// Per-instance direction (literal seed).
@Component.define()
class LocalPanel extends Component("local-panel", { providers: [directionProvider("ltr")] }) {
  render() {
    return html`<p>${this.direction.value}</p>`;
  }
}

// Shared store: both components flip together.
const store = createDirectionStore("ltr");
@Component.define()
class SharedA extends Component("shared-a", { providers: [directionProvider(store)] }) {
  render() {
    return html`<p>${this.direction.value}</p>`;
  }
}
@Component.define()
class SharedB extends Component("shared-b", { providers: [directionProvider(store)] }) {
  render() {
    return html`<p>${this.direction.value}</p>`;
  }
}

// ── type-level checks (never executed) ───────────────────────────────────────────
() => {
  const el = document.createElement("local-panel") as InstanceType<typeof LocalPanel>;
  el.direction.set("rtl"); // ✓ namespaced under this.direction
  el.direction.toggle(); // ✓
  const d: "ltr" | "rtl" | "auto" = el.direction.value; // ✓ typed Direction
  void d;
  // @ts-expect-error — not a valid Direction
  el.direction.set("sideways");
  // @ts-expect-error — helpers live under this.direction, not flat on the instance
  el.setDirection("rtl");
};

const root = document.createElement("div");
document.body.appendChild(root);

class DirectionSuite extends Test({ name: "dom-provider-direction" }) {
  @Test.afterEach() reset() {
    store.set("ltr");
  }

  @Test.it("this.direction namespaces the API (value/set/toggle)") namespaced() {
    const el = document.createElement("local-panel") as HTMLElement & {
      direction: { value: string };
      setDirection?: unknown;
    };
    root.appendChild(el);
    flushSync();
    expect(el.direction.value).toBe("ltr");
    expect(el.setDirection).toBeUndefined(); // not leaked flat onto the instance
    el.remove();
  }

  @Test.it("reflects the initial dir attribute") initial() {
    const el = document.createElement("local-panel");
    root.appendChild(el);
    flushSync();
    expect(el.getAttribute("dir")).toBe("ltr");
    expect(el.shadowRoot!.textContent).toBe("ltr");
    el.remove();
  }

  @Test.it("direction.set updates the attribute + re-renders") setDir() {
    const el = document.createElement("local-panel") as HTMLElement & {
      direction: { set(d: string): void };
    };
    root.appendChild(el);
    flushSync();
    el.direction.set("rtl");
    flushSync();
    expect(el.getAttribute("dir")).toBe("rtl");
    expect(el.shadowRoot!.textContent).toBe("rtl");
    el.remove();
  }

  @Test.it("direction.toggle flips ltr ⇄ rtl") toggle() {
    const el = document.createElement("local-panel") as HTMLElement & {
      direction: { value: string; toggle(): void };
    };
    root.appendChild(el);
    flushSync();
    el.direction.toggle();
    flushSync();
    expect(el.direction.value).toBe("rtl");
    el.direction.toggle();
    flushSync();
    expect(el.direction.value).toBe("ltr");
    el.remove();
  }

  @Test.it("per-instance literal direction is independent") independent() {
    const a = document.createElement("local-panel") as HTMLElement & { direction: { set(d: string): void } };
    const b = document.createElement("local-panel");
    root.append(a, b);
    flushSync();
    a.direction.set("rtl");
    flushSync();
    expect(a.getAttribute("dir")).toBe("rtl");
    expect(b.getAttribute("dir")).toBe("ltr"); // unaffected
    a.remove();
    b.remove();
  }

  @Test.it("a shared store flips every bound component") shared() {
    const a = document.createElement("shared-a");
    const b = document.createElement("shared-b");
    root.append(a, b);
    flushSync();
    store.set("rtl");
    flushSync();
    expect(a.getAttribute("dir")).toBe("rtl");
    expect(b.getAttribute("dir")).toBe("rtl");
    expect(b.shadowRoot!.textContent).toBe("rtl");
    a.remove();
    b.remove();
  }

  @Test.it("stops reacting to the shared store after disconnect") cleanup() {
    const a = document.createElement("shared-a");
    root.appendChild(a);
    flushSync();
    a.remove();
    store.set("rtl");
    flushSync(); // must not throw / touch the detached node
    expect(a.getAttribute("dir")).toBe("ltr");
  }

  @Test.it("directionOf maps RTL locales") localeMap() {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("he-IL")).toBe("rtl");
    expect(directionOf("en-US")).toBe("ltr");
  }
}

await TestApplication().addTests(DirectionSuite).reporter(new ConsoleReporter()).run();
