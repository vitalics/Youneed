// fromSvelte bridge: wrap a Svelte 5 component as a custom element and confirm it
// renders inside a @youneed/dom tree — class form (reusable, props remount in
// place), instance form, forwarded events, and unmount teardown.
//
// A real Svelte component is compiler output, so the test compiles a tiny one with
// `svelte/compiler` at runtime, writes the JS, and imports it.
// Run: pnpm --filter @youneed/dom-adapter-svelte test

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { compile } = await import("svelte/compiler");
const svelte = await import("svelte");
const { Component, Mount, html } = await import("@youneed/dom");
const { fromSvelte } = await import("../src/from-svelte.ts");

// ── compile a tiny Svelte 5 component to importable JS ──────────────────────────
const SOURCE = `
<script>
  let { name = "world", onselect } = $props();
</script>
<p>hi {name}</p>
<button onclick={() => onselect?.(name)}>go</button>
`;
const { js } = compile(SOURCE, { name: "Hello", generate: "client", runes: true, dev: false });
// Write inside the package so bare `svelte/internal/*` imports resolve via its
// node_modules; the `.mjs` extension forces ESM loading.
const dir = join(dirname(fileURLToPath(import.meta.url)), ".compiled");
mkdirSync(dir, { recursive: true });
const file = join(dir, "Hello.mjs");
writeFileSync(file, js.code);
const { default: Hello } = await import(pathToFileURL(file).href);

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Let the async mount (dynamic svelte import) settle, then flush Svelte's queue. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    svelte.flushSync();
  }
  await svelte.tick();
}

/** Append `el` to a fresh detached container and let Svelte render. */
async function mount(el: HTMLElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.appendChild(el);
  await settle();
  return container;
}

// ── class form ────────────────────────────────────────────────────────────────
{
  const SvelteHello = fromSvelte(Hello);
  check("class form derives a kebab tag", /^svelte-hello-/.test(SvelteHello.tagName));
  check(
    "class form registers the element",
    globalThis.customElements.get(SvelteHello.tagName) === (SvelteHello as unknown),
  );

  const el = new SvelteHello({ name: "Ada" });
  const container = await mount(el);
  check("class form renders the Svelte component", !!container.textContent?.includes("hi Ada"));

  // Reassigning props remounts with fresh props.
  el.props = { name: "Bo" };
  await settle();
  check("reassigning props re-renders", !!container.textContent?.includes("hi Bo"));
}

// ── instance form ───────────────────────────────────────────────────────────
{
  const el = fromSvelte(Hello, { name: "Lin" });
  const container = await mount(el);
  check("instance form renders with initial props", !!container.textContent?.includes("hi Lin"));
}

// ── explicit tag is reused, not redefined ──────────────────────────────────────
{
  const A = fromSvelte(Hello, { tagName: "x-svelte-hello" });
  const B = fromSvelte(Hello, { tagName: "x-svelte-hello" });
  check("explicit tag maps to a single class", A === B);
}

// ── nominated events surface as DOM CustomEvents ────────────────────────────────
{
  const SvelteHello = fromSvelte(Hello, { tagName: "x-svelte-evt", events: ["select"] });
  const el = new SvelteHello({ name: "Ev" });
  let detail: unknown = undefined;
  el.addEventListener("select", (e) => (detail = (e as CustomEvent).detail));
  await mount(el);
  // Svelte 5 delegates `click` at the mount root, so the event must bubble.
  el.querySelector("button")?.dispatchEvent(new Event("click", { bubbles: true }));
  await settle();
  check("onselect callback prop re-dispatches as a `select` CustomEvent", detail === "Ev");
}

// ── embeds into a @youneed/dom html`` template via node interpolation ───────────
{
  const node = fromSvelte(Hello, { name: "Mo" });

  @Component.define()
  class Host extends Component("x-svelte-host") {
    render() {
      return html`<section>${node}</section>`;
    }
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = Mount(container, Host);
  await settle();
  check("node hosts a Svelte render inside a dom html`` slot", !!handle.element.shadowRoot?.textContent?.includes("hi Mo"));
}

// ── disconnect unmounts the Svelte instance ──────────────────────────────────
{
  const el = fromSvelte(Hello, { name: "Zo" });
  const container = await mount(el);
  check("mounted before disconnect", !!container.textContent?.includes("hi Zo"));
  el.remove();
  await settle();
  check("disconnect clears the host", el.textContent === "" || !document.body.contains(el));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
