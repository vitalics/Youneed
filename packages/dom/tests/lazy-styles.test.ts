// Lazy CSS via `styles: () => import(...)` (a non-preferred path — see the
// JSDoc on ComponentOptions.styles). Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, css, define } = await import("../src/dom.ts");

const tick = () => new Promise((r) => setTimeout(r, 10));

// Three lazy shapes the loader must accept: bare string, { default: string }, sheet.
const lazyString = () => Promise.resolve(".lazy { color: rgb(1, 2, 3); }");
const lazyModule = () => Promise.resolve({ default: ".lazym { color: rgb(4, 5, 6); }" });

class LazyCard extends Component("lazy-card", {
  styles: [css`:host { display: block; }`, lazyString, lazyModule],
}) {
  render() {
    return html`<p class="lazy lazym">hi</p>`;
  }
}
define(LazyCard);

const el = document.createElement("lazy-card") as HTMLElement & { flushSync(): void };
document.body.appendChild(el);
(el as { flushSync?: () => void }).flushSync?.();

// Synchronous styles are adopted immediately; lazy ones are NOT yet (FOUC).
const atConnect = el.shadowRoot!.adoptedStyleSheets.length;
await tick();
const afterLoad = el.shadowRoot!.adoptedStyleSheets.length;

// A second instance shares the same resolved lazy sheets (one resolution, by ref).
const el2 = document.createElement("lazy-card");
document.body.appendChild(el2);
(el2 as { flushSync?: () => void }).flushSync?.();
await tick();
const a = [...el.shadowRoot!.adoptedStyleSheets];
const b = [...el2.shadowRoot!.adoptedStyleSheets];
const shared = a.slice(1).every((s, i) => s === b[i + 1]);

class LazyStylesTest extends Test({ name: "dom lazy styles" }) {
  @Test.it("only the sync sheet is adopted at connect") syncOnly() {
    expect(atConnect).toBe(1);
  }
  @Test.it("lazy sheets are adopted once resolved (1 sync + 2 lazy)") lazyAdopted() {
    expect(afterLoad).toBe(3);
  }
  @Test.it("lazy sheets are shared across instances (by reference)") sharedByRef() {
    expect(shared).toBeTruthy();
  }
}

await TestApplication().addTests(LazyStylesTest).reporter(new ConsoleReporter()).run();
