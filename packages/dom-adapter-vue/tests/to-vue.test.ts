// toVue bridge: turn a @youneed/dom component into a Vue component — by class, raw
// tag and live instance — and confirm props reach the reactive component and
// `on<Event>` props receive its exposed CustomEvents.
// Run: pnpm --filter @youneed/dom-adapter-vue test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { createApp, h, reactive, nextTick } = await import("vue");
const { Component, html, flushSync } = await import("@youneed/dom");
const { toVue } = await import("../src/to-vue.ts");

@Component.define()
class Greet extends Component("x-vgreet") {
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

const VueGreet = toVue(Greet);

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Mount a render function into a fresh detached host; flush Vue + the dom scheduler. */
async function mount(render: () => unknown) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp({ render });
  app.mount(container);
  await nextTick();
  flushSync();
  await nextTick();
  return { container, app };
}

// ── class form returns a Vue component (typed props) ────────────────────────────
{
  const { container } = await mount(() => h(VueGreet, { name: "Ada" }));
  const el = container.querySelector("x-vgreet");
  check("class form mounts the custom element", !!el);
  check("class form applies the prop", !!el?.shadowRoot?.textContent?.includes("Ada"));
}

// ── raw-tag form ────────────────────────────────────────────────────────────
{
  const TagGreet = toVue(Greet.tagName);
  const { container } = await mount(() => h(TagGreet, { name: "Lin" }));
  const el = container.querySelector("x-vgreet");
  check("tag form mounts the custom element", !!el);
  check("tag form applies the prop", !!el?.shadowRoot?.textContent?.includes("Lin"));
}

// ── instance form (mounts a specific live element) ──────────────────────────────
{
  const InstGreet = toVue(new Greet({ name: "Bo" }));
  const { container } = await mount(() => h(InstGreet, {}));
  const el = container.querySelector("x-vgreet");
  check("instance form mounts the live element", !!el);
  check("instance form keeps its constructor props", !!el?.shadowRoot?.textContent?.includes("Bo"));
}

// ── on<Event> wires the exposed CustomEvent ─────────────────────────────────────
{
  let received: unknown = undefined;
  const { container } = await mount(() =>
    h(VueGreet, { name: "Ev", onPing: (e: CustomEvent) => (received = e.detail) }),
  );
  const el = container.querySelector("x-vgreet") as InstanceType<typeof Greet>;
  el.fire();
  await nextTick();
  check("onPing receives the exposed CustomEvent detail", received === "pong");
}

// ── template ref exposes the underlying element ─────────────────────────────────
{
  const elRef = { value: null as unknown };
  await mount(() => h(VueGreet, { name: "Rf", ref: (r: unknown) => (elRef.value = r) }));
  const exposed = elRef.value as { element?: HTMLElement } | null;
  check("ref exposes { element } as the custom element", exposed?.element?.tagName.toLowerCase() === "x-vgreet");
}

// ── prop updates re-render; stale listeners are dropped ─────────────────────────
{
  const props = reactive<{ name: string; onPing?: (e: CustomEvent) => void }>({ name: "Up", onPing: () => count++ });
  let count = 0;
  const { container } = await mount(() => h(VueGreet, { ...props }));
  const el = container.querySelector("x-vgreet") as InstanceType<typeof Greet>;
  el.fire();
  await nextTick();
  // Re-render without the handler — listener must be removed.
  props.onPing = undefined;
  props.name = "Up2";
  await nextTick();
  flushSync();
  el.fire();
  await nextTick();
  check("listener fires once, then is removed on re-render", count === 1);
  check("prop update re-renders the component", !!el?.shadowRoot?.textContent?.includes("Up2"));
}

// ── unmount tears the element down ──────────────────────────────────────────
{
  const { container, app } = await mount(() => h(VueGreet, { name: "Mo" }));
  check("mounted before unmount", !!container.querySelector("x-vgreet"));
  app.unmount();
  await nextTick();
  check("unmount removes the element", !container.querySelector("x-vgreet"));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
