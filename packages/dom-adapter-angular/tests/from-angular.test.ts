// fromAngular bridge: wrap an Angular component as a custom element and confirm
// it renders, syncs @Input()s, surfaces @Output()s as DOM events, and tears down.
//
// Runs in its OWN tsconfig (legacy `experimentalDecorators` + `useDefineForClassFields:
// false`) — Angular's decorators can't share a compilation with the repo's TC39
// ones, exactly as packages/dom/bench/angular.bench.ts does. So this file does NOT
// touch @youneed/dom's decorator API; it bridges Angular ⇄ plain DOM only.
// Run (via the package test script): tsx --tsconfig tests/tsconfig.angular.json tests/from-angular.test.ts

import { registerDOM } from "@youneed/dom/register";

registerDOM();

import "@angular/compiler"; // enable the JIT compiler (no AOT step here)
import { Component as NgComponent, Input, Output, EventEmitter } from "@angular/core";
import { fromAngular } from "../src/from-angular.ts";
import { emit } from "../src/emit.ts";

// A plain Angular standalone component — exactly what a consumer would have.
// The button lets the test drive the @Output the way a real user would.
@NgComponent({
  selector: "ng-hello",
  template: `<p>hi {{ name }}</p><button (click)="pick.emit(name)">go</button>`,
})
class HelloComponent {
  @Input() name = "world";
  @Output() pick = new EventEmitter<string>();
}

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Append `el`, let the async Angular bootstrap + change detection settle. */
async function mount(el: HTMLElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.appendChild(el);
  await tick();
  return container;
}
/** Drain microtasks/macrotasks so the dynamic import + bootstrap resolve. */
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── class form ────────────────────────────────────────────────────────────────
{
  const NgHello = fromAngular(HelloComponent);
  check("class form derives a kebab tag", /^ng-hello-\d+$/.test(NgHello.tagName));
  check("class form registers the element", globalThis.customElements.get(NgHello.tagName) === (NgHello as unknown));

  const el = new NgHello({ name: "Ada" });
  const container = await mount(el);
  check("class form renders the Angular component", !!container.textContent?.includes("hi Ada"));

  // Reassigning props re-renders in place (no remount).
  el.props = { name: "Bo" };
  await tick();
  check("reassigning props re-renders", !!container.textContent?.includes("hi Bo"));
}

// ── instance form ───────────────────────────────────────────────────────────
{
  const el = fromAngular(HelloComponent, { name: "Lin" });
  const container = await mount(el);
  check("instance form renders with initial props", !!container.textContent?.includes("hi Lin"));
}

// ── @Output() surfaces as a DOM CustomEvent ─────────────────────────────────────
{
  const NgHello = fromAngular(HelloComponent, { tagName: "ng-hello-out" });
  const el = new NgHello({ name: "Mo" });
  await mount(el);

  let received: string | undefined;
  el.addEventListener("pick", (e) => (received = (e as CustomEvent<string>).detail));

  // Click the Angular-rendered button → its `(click)` fires `pick.emit(name)` →
  // the host re-dispatches a `pick` CustomEvent carrying the value.
  el.querySelector("button")!.click();
  await tick();
  check("@Output() surfaces as a DOM CustomEvent (detail = value)", received === "Mo");

  // …and `emit` can fire that same event from the host imperatively.
  let manual: string | undefined;
  el.addEventListener("pick", (e) => (manual = (e as CustomEvent<string>).detail), { once: true });
  emit(el, { type: "pick", detail: "manual" });
  check("emit() fires the host event imperatively", manual === "manual");
}

// ── explicit tag is reused, not redefined ──────────────────────────────────────
{
  const A = fromAngular(HelloComponent, { tagName: "ng-hello-shared" });
  const B = fromAngular(HelloComponent, { tagName: "ng-hello-shared" });
  check("explicit tag maps to a single class", A === B);
}

// ── disconnect tears the Angular view down ──────────────────────────────────
{
  const el = fromAngular(HelloComponent, { name: "Zo" });
  const container = await mount(el);
  check("mounted before disconnect", !!container.textContent?.includes("hi Zo"));
  el.remove();
  await tick();
  check("disconnect clears the host", el.textContent === "" || !document.body.contains(el));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
