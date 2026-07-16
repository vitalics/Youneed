// toReact bridge: turn a @youneed/dom component into a React component — by
// class, raw tag and live instance — and confirm props reach the reactive
// component and `on<Event>` props receive its exposed CustomEvents.
// Run: pnpm --filter @youneed/dom-adapter-react test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { act, createElement, useRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Component, html, flushSync } = await import("@youneed/dom");
const { toReact } = await import("../src/to-react.ts");

// React 19's act() warns unless this global is set.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

@Component.define()
class Greet extends Component("x-greet") {
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

const ReactGreet = toReact(Greet);

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Render `node` into a fresh detached root, flush React + the dom scheduler. */
async function mount(node: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  flushSync(); // dom scheduler: apply the prop re-render synchronously
  await act(async () => {});
  return { container, root };
}

// ── class form returns a React component (typed props) ──────────────────────────
{
  const { container } = await mount(createElement(ReactGreet, { name: "Ada" }));
  const el = container.querySelector("x-greet");
  check("class form mounts the custom element", !!el);
  check("class form applies the prop", !!el?.shadowRoot?.textContent?.includes("Ada"));
}

// ── raw-tag form ────────────────────────────────────────────────────────────
{
  const TagGreet = toReact(Greet.tagName);
  const { container } = await mount(createElement(TagGreet, { name: "Lin" }));
  const el = container.querySelector("x-greet");
  check("tag form mounts the custom element", !!el);
  check("tag form applies the prop", !!el?.shadowRoot?.textContent?.includes("Lin"));
}

// ── instance form (mounts a specific live element) ──────────────────────────────
{
  const InstGreet = toReact(new Greet({ name: "Bo" }));
  const { container } = await mount(createElement(InstGreet, {}));
  const el = container.querySelector("x-greet");
  check("instance form mounts the live element", !!el);
  check("instance form keeps its constructor props", !!el?.shadowRoot?.textContent?.includes("Bo"));
}

// ── on<Event> wires the exposed CustomEvent ─────────────────────────────────────
{
  let received: unknown = undefined;
  const { container } = await mount(
    createElement(ReactGreet, { name: "Ev", onPing: (e: CustomEvent) => (received = e.detail) }),
  );
  const el = container.querySelector("x-greet") as InstanceType<typeof Greet>;
  await act(async () => {
    el.fire();
  });
  check("onPing receives the exposed CustomEvent detail", received === "pong");
}

// ── ref resolves to the underlying element ────────────────────────────────────
{
  let captured: HTMLElement | null = null;
  function Wrapper() {
    const ref = useRef<HTMLElement>(null);
    useRef(() => {});
    // capture after mount via callback ref
    return createElement(ReactGreet, {
      name: "Rf",
      ref: (node: HTMLElement | null) => {
        captured = node;
        void ref;
      },
    });
  }
  await mount(createElement(Wrapper));
  check("ref resolves to the custom element", captured?.tagName.toLowerCase() === "x-greet");
}

// ── prop updates re-render; stale listeners are dropped ─────────────────────────
{
  let count = 0;
  const handler = () => count++;
  const { container, root } = await mount(createElement(ReactGreet, { name: "Up", onPing: handler }));
  const el = container.querySelector("x-greet") as InstanceType<typeof Greet>;
  await act(async () => el.fire());
  // Re-render without the handler — listener must be removed.
  await act(async () => root.render(createElement(ReactGreet, { name: "Up2" })));
  await act(async () => el.fire());
  check("listener fires once, then is removed on re-render", count === 1);
  check("prop update re-renders the component", !!el?.shadowRoot?.textContent?.includes("Up2"));
}

// ── unmount tears the element down ──────────────────────────────────────────
{
  const { container, root } = await mount(createElement(ReactGreet, { name: "Mo" }));
  check("mounted before unmount", !!container.querySelector("x-greet"));
  await act(async () => root.unmount());
  check("unmount removes the element", !container.querySelector("x-greet"));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
