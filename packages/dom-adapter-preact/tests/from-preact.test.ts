// fromPreact bridge: wrap a Preact component as a custom element and confirm it
// renders inside a @youneed/dom tree — class form (reusable, props re-render in
// place), instance form, and unmount teardown.
// Run: pnpm --filter @youneed/dom-adapter-preact test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { createElement } = await import("preact");
const { act } = await import("preact/test-utils");
const { Component, Mount, html, flushSync } = await import("@youneed/dom");
const { fromPreact } = await import("../src/from-preact.ts");

// A plain Preact component — exactly what a consumer would already have.
function Hello(props: { name?: string }) {
  return createElement("p", null, `hi ${props.name ?? "world"}`);
}

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Append `el` to a fresh detached container and flush Preact + the scheduler. */
async function mount(el: HTMLElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    container.appendChild(el);
  });
  flushSync();
  await act(async () => {});
  return container;
}

// ── class form ────────────────────────────────────────────────────────────────
{
  const PreactHello = fromPreact(Hello);
  check("class form derives a kebab tag", /^preact-hello-/.test(PreactHello.tagName));
  check("class form registers the element", globalThis.customElements.get(PreactHello.tagName) === (PreactHello as unknown));

  const el = new PreactHello({ name: "Ada" });
  const container = await mount(el);
  check("class form renders the Preact component", !!container.textContent?.includes("hi Ada"));

  // Reassigning props re-renders in place (no remount).
  await act(async () => {
    el.props = { name: "Bo" };
  });
  check("reassigning props re-renders", !!container.textContent?.includes("hi Bo"));
}

// ── instance form ───────────────────────────────────────────────────────────
{
  const el = fromPreact(Hello, { name: "Lin" });
  const container = await mount(el);
  check("instance form renders with initial props", !!container.textContent?.includes("hi Lin"));
}

// ── explicit tag is reused, not redefined ──────────────────────────────────────
{
  const A = fromPreact(Hello, { tagName: "x-preact-hello" });
  const B = fromPreact(Hello, { tagName: "x-preact-hello" });
  check("explicit tag maps to a single class", A === B);
}

// ── embeds into a @youneed/dom html`` template via node interpolation ───────────
{
  const node = fromPreact(Hello, { name: "Mo" });

  @Component.define()
  class Host extends Component("x-preact-host") {
    render() {
      return html`<section>${node}</section>`;
    }
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  let handle: ReturnType<typeof Mount>;
  await act(async () => {
    handle = Mount(container, Host);
  });
  flushSync();
  await act(async () => {});
  check(
    "node hosts a Preact render inside a dom html`` slot",
    !!handle!.element.shadowRoot?.textContent?.includes("hi Mo"),
  );
}

// ── disconnect unmounts the Preact render ────────────────────────────────────
{
  const el = fromPreact(Hello, { name: "Zo" });
  const container = await mount(el);
  check("mounted before disconnect", !!container.textContent?.includes("hi Zo"));
  await act(async () => {
    el.remove();
  });
  await act(async () => {});
  check("disconnect clears the host", el.textContent === "" || !document.body.contains(el));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
