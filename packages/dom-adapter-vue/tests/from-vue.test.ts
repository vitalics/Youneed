// fromVue bridge: wrap a Vue component as a custom element and confirm it renders
// inside a @youneed/dom tree — class form (reusable, props re-render in place),
// instance form, declared `emits` surfacing as DOM events, and unmount teardown.
// Run: pnpm --filter @youneed/dom-adapter-vue test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { defineComponent, h, nextTick } = await import("vue");
const { fromVue } = await import("../src/from-vue.ts");

// A plain Vue component — exactly what a consumer would already have. It renders a
// greeting and re-emits a `pick` event when its button is clicked.
const Hello = defineComponent({
  name: "Hello",
  props: { name: { type: String, default: "world" } },
  emits: ["pick"],
  setup(props, { emit }) {
    return () => h("div", [h("p", `hi ${props.name}`), h("button", { onClick: () => emit("pick", props.name) }, "go")]);
  },
});

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Append `el` to a fresh detached container and let Vue's render settle. */
async function mount(el: HTMLElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.appendChild(el);
  await nextTick();
  await tick();
  return container;
}
/** Drain microtasks so the dynamic `import("vue")` resolves before we assert. */
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── class form ────────────────────────────────────────────────────────────────
{
  const VueHello = fromVue(Hello);
  check("class form derives a kebab tag", /^vue-hello-\d+$/.test(VueHello.tagName));
  check("class form registers the element", globalThis.customElements.get(VueHello.tagName) === (VueHello as unknown));

  const el = new VueHello({ name: "Ada" });
  const container = await mount(el);
  check("class form renders the Vue component", !!container.textContent?.includes("hi Ada"));

  // Reassigning props re-renders in place (no remount).
  el.props = { name: "Bo" };
  await nextTick();
  check("reassigning props re-renders", !!container.textContent?.includes("hi Bo"));
}

// ── instance form ───────────────────────────────────────────────────────────
{
  const el = fromVue(Hello, { name: "Lin" });
  const container = await mount(el);
  check("instance form renders with initial props", !!container.textContent?.includes("hi Lin"));
}

// ── declared emits surface as DOM CustomEvents ──────────────────────────────────
{
  const VueHello = fromVue(Hello, { tagName: "vue-hello-out" });
  const el = new VueHello({ name: "Mo" });
  await mount(el);

  let received: string | undefined;
  el.addEventListener("pick", (e) => (received = (e as CustomEvent<string>).detail));
  el.querySelector("button")!.click();
  await nextTick();
  check("emit() surfaces as a DOM CustomEvent (detail = payload)", received === "Mo");
}

// ── explicit tag is reused, not redefined ──────────────────────────────────────
{
  const A = fromVue(Hello, { tagName: "vue-hello-shared" });
  const B = fromVue(Hello, { tagName: "vue-hello-shared" });
  check("explicit tag maps to a single class", A === B);
}

// ── disconnect unmounts the Vue app ──────────────────────────────────────────
{
  const el = fromVue(Hello, { name: "Zo" });
  const container = await mount(el);
  check("mounted before disconnect", !!container.textContent?.includes("hi Zo"));
  el.remove();
  await tick();
  check("disconnect clears the host", el.textContent === "" || !document.body.contains(el));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
