// @Component.compile(): a static template renders once, then the instance freezes
// (re-renders are dropped). A dynamic template with @compile is a harmless no-op.
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, define, flushSync, setDefaultScheduler, syncScheduler } = await import("../src/dom.ts");
setDefaultScheduler(syncScheduler);

// Static template + @compile → renders once, then frozen.
let staticRenders = 0;
@Component.define()
class CompiledStatic extends Component("compiled-static") {
  @Component.prop() count = 0;
  @Component.compile()
  render() {
    staticRenders++;
    return html`<div class="c">static only</div>`;
  }
}

// Same static template WITHOUT @compile → re-renders normally (control).
let plainRenders = 0;
@Component.define()
class PlainStatic extends Component("plain-static") {
  @Component.prop() count = 0;
  render() {
    plainRenders++;
    return html`<div class="c">static only</div>`;
  }
}

// @compile on a DYNAMIC template → must NOT freeze (still reflects changes).
let dynRenders = 0;
@Component.define()
class CompiledDynamic extends Component("compiled-dynamic") {
  @Component.prop() count = 0;
  @Component.compile()
  render() {
    dynRenders++;
    return html`<div class="c">count: ${this.count}</div>`;
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

// ── static + @compile ──
const s = mount<HTMLElement & { count: number }>("compiled-static");
const afterFirst = staticRenders;
s.count = 1;
flushSync();
s.count = 2;
flushSync();
const txtStatic = s.shadowRoot?.querySelector(".c")?.textContent;

// ── plain static (control) ──
const p = mount<HTMLElement & { count: number }>("plain-static");
p.count = 1;
flushSync();

// ── dynamic + @compile ──
const d = mount<HTMLElement & { count: number }>("compiled-dynamic");
d.count = 5;
flushSync();
const txtDyn = d.shadowRoot?.querySelector(".c")?.textContent;

class CompileTest extends Test({ name: "@Component.compile()" }) {
  @Test.it("renders the static template correctly") renders() {
    expect(txtStatic).toBe("static only");
  }
  @Test.it("renders the static template exactly once") once() {
    expect(afterFirst).toBe(1);
  }
  @Test.it("freezes: updates after first render are dropped") frozen() {
    expect(staticRenders).toBe(1);
  }
  @Test.it("control: a plain static component DOES re-render") control() {
    expect(plainRenders).toBe(2);
  }
  @Test.it("a dynamic @compile template is NOT frozen (reflects changes)") dynamic() {
    expect(txtDyn).toBe("count: 5");
    expect(dynRenders).toBe(2);
  }
}

await TestApplication().addTests(CompileTest).reporter(new ConsoleReporter()).run();
