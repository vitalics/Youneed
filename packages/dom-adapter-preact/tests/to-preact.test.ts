// toPreact bridge: turn a @youneed/dom component into a Preact component — by
// class, raw tag and live instance — and confirm props reach the reactive
// component and `on<Event>` props receive its exposed CustomEvents.
// Run: pnpm --filter @youneed/dom-adapter-preact test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { createElement, render } = await import("preact");
const { act } = await import("preact/test-utils");
const { Component, html, flushSync } = await import("@youneed/dom");
const { toPreact } = await import("../src/to-preact.ts");

@Component.define()
class Greet extends Component("x-pgreet") {
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

const PreactGreet = toPreact(Greet);

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Render `node` into a fresh detached container; flush Preact + the dom scheduler. */
async function mount(node: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    render(node, container);
  });
  flushSync(); // dom scheduler: apply the prop re-render synchronously
  await act(async () => {});
  return { container };
}

// ── class form returns a Preact component (typed props) ─────────────────────────
{
  const { container } = await mount(createElement(PreactGreet, { name: "Ada" }));
  const el = container.querySelector("x-pgreet");
  check("class form mounts the custom element", !!el);
  check("class form applies the prop", !!el?.shadowRoot?.textContent?.includes("Ada"));
}

// ── raw-tag form ────────────────────────────────────────────────────────────
{
  const TagGreet = toPreact(Greet.tagName);
  const { container } = await mount(createElement(TagGreet, { name: "Lin" }));
  const el = container.querySelector("x-pgreet");
  check("tag form mounts the custom element", !!el);
  check("tag form applies the prop", !!el?.shadowRoot?.textContent?.includes("Lin"));
}

// ── instance form (mounts a specific live element) ──────────────────────────────
{
  const InstGreet = toPreact(new Greet({ name: "Bo" }));
  const { container } = await mount(createElement(InstGreet, {}));
  const el = container.querySelector("x-pgreet");
  check("instance form mounts the live element", !!el);
  check("instance form keeps its constructor props", !!el?.shadowRoot?.textContent?.includes("Bo"));
}

// ── on<Event> wires the exposed CustomEvent ─────────────────────────────────────
{
  let received: unknown = undefined;
  const { container } = await mount(
    createElement(PreactGreet, { name: "Ev", onPing: (e: CustomEvent) => (received = e.detail) }),
  );
  const el = container.querySelector("x-pgreet") as InstanceType<typeof Greet>;
  await act(async () => {
    el.fire();
  });
  check("onPing receives the exposed CustomEvent detail", received === "pong");
}

// ── ref resolves to the underlying element ────────────────────────────────────
{
  let captured: HTMLElement | null = null;
  await mount(
    createElement(PreactGreet, {
      name: "Rf",
      ref: (node: HTMLElement | null) => (captured = node),
    }),
  );
  check("ref resolves to the custom element", captured?.tagName.toLowerCase() === "x-pgreet");
}

// ── prop updates re-render; stale listeners are dropped ─────────────────────────
{
  let count = 0;
  const handler = () => count++;
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => render(createElement(PreactGreet, { name: "Up", onPing: handler }), container));
  flushSync();
  const el = container.querySelector("x-pgreet") as InstanceType<typeof Greet>;
  await act(async () => el.fire());
  // Re-render without the handler — listener must be removed.
  await act(async () => render(createElement(PreactGreet, { name: "Up2" }), container));
  flushSync();
  await act(async () => el.fire());
  check("listener fires once, then is removed on re-render", count === 1);
  check("prop update re-renders the component", !!el?.shadowRoot?.textContent?.includes("Up2"));
}

// ── unmount tears the element down ──────────────────────────────────────────
{
  const { container } = await mount(createElement(PreactGreet, { name: "Mo" }));
  check("mounted before unmount", !!container.querySelector("x-pgreet"));
  await act(async () => render(null, container));
  check("unmount removes the element", !container.querySelector("x-pgreet"));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
