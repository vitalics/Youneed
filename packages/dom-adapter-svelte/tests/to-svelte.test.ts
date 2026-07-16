// toSvelte bridge: the dom→Svelte direction is a Svelte action. We drive it the
// way Svelte's runtime would — call the action on a node, then `update`/`destroy`
// — and confirm props reach the reactive component as properties and `on<Event>`
// params receive its exposed CustomEvents.
// Run: pnpm --filter @youneed/dom-adapter-svelte test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { Component, html, flushSync } = await import("@youneed/dom");
const { toSvelte } = await import("../src/to-svelte.ts");

@Component.define()
class Greet extends Component("x-svgreet") {
  @Component.prop() name = "world";
  // Exposed event named by its field — fires CustomEvent type "ping".
  @Component.event() ping!: import("@youneed/dom").EventEmitter<string>;
  render() {
    return html`<p>hi ${this.name}</p>`;
  }
  fire() {
    this.ping("pong");
  }
}

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Create a live element, connect it, and return it (Svelte renders the tag; the
 *  action only syncs props/events). */
function makeEl(): InstanceType<typeof Greet> {
  const el = document.createElement(Greet.tagName) as InstanceType<typeof Greet>;
  document.body.appendChild(el);
  return el;
}

// ── action carries the tag for <svelte:element> ─────────────────────────────────
{
  const greet = toSvelte(Greet);
  check("action exposes .tagName", greet.tagName === "x-svgreet");
  const tagGreet = toSvelte(Greet.tagName);
  check("tag form exposes .tagName", tagGreet.tagName === "x-svgreet");
}

// ── props are applied as properties; component re-renders ───────────────────────
{
  const greet = toSvelte(Greet);
  const el = makeEl();
  greet(el, { name: "Ada" });
  flushSync();
  check("action applies the prop", !!el.shadowRoot?.textContent?.includes("Ada"));
}

// ── on<Event> wires the exposed CustomEvent ─────────────────────────────────────
{
  const greet = toSvelte(Greet);
  const el = makeEl();
  let received: unknown = undefined;
  greet(el, { name: "Ev", onPing: (e: CustomEvent) => (received = e.detail) });
  el.fire();
  check("onPing receives the exposed CustomEvent detail", received === "pong");
}

// ── update() re-syncs; stale listeners are dropped ──────────────────────────────
{
  const greet = toSvelte(Greet);
  const el = makeEl();
  let count = 0;
  const handle = greet(el, { name: "Up", onPing: () => count++ });
  el.fire();
  // Re-run the action without the handler — listener must be removed.
  handle.update({ name: "Up2" });
  flushSync();
  el.fire();
  check("listener fires once, then is removed on update", count === 1);
  check("update re-renders the component", !!el.shadowRoot?.textContent?.includes("Up2"));
}

// ── destroy() detaches listeners ────────────────────────────────────────────────
{
  const greet = toSvelte(Greet);
  const el = makeEl();
  let count = 0;
  const handle = greet(el, { onPing: () => count++ });
  handle.destroy();
  el.fire();
  check("destroy removes the listener", count === 0);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
