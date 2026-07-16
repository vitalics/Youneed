// toAngular bridge: build a @youneed/dom element via class, instance and raw-tag
// forms, and confirm props reach the reactive component as live JS properties.
// (No Angular needed — toAngular is pure DOM.)
// Run: pnpm --filter @youneed/dom-adapter-angular test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { Component, html, flushSync } = await import("@youneed/dom");
const { toAngular } = await import("../src/to-angular.ts");

@Component.define()
class Greet extends Component("x-ng-greet") {
  @Component.prop() name = "world";
  render() {
    return html`<p>hi ${this.name}</p>`;
  }
}

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Append `el` to a fresh detached container and flush the dom scheduler. */
function mount(el: HTMLElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.appendChild(el);
  flushSync();
  return container;
}

// ── class form (typed props) ──────────────────────────────────────────────────
{
  const el = toAngular(Greet, { name: "Ada" });
  check("class form builds the custom element", el.tagName.toLowerCase() === "x-ng-greet");
  mount(el);
  check("class form applies the prop", !!el.shadowRoot?.textContent?.includes("Ada"));
}

// ── raw-tag form ────────────────────────────────────────────────────────────
{
  const el = toAngular(Greet.tagName, { name: "Lin" });
  mount(el);
  check("tag form mounts the custom element", el.tagName.toLowerCase() === "x-ng-greet");
  check("tag form applies the prop", !!el.shadowRoot?.textContent?.includes("Lin"));
}

// ── instance form (apply extra props onto a pre-built element) ──────────────────
{
  const el = toAngular(new Greet({ name: "Bo" }));
  mount(el);
  check("instance form returns the live element", el instanceof Greet);
  check("instance form keeps its constructor props", !!el.shadowRoot?.textContent?.includes("Bo"));
}

// ── props are live: reassigning updates the reactive component ──────────────────
{
  const el = toAngular(Greet, { name: "Mo" });
  mount(el);
  (el as Greet).name = "Zo";
  flushSync();
  check("reassigning a prop re-renders", !!el.shadowRoot?.textContent?.includes("Zo"));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
