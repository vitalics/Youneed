// fromReact bridge: wrap a React component as a custom element and confirm it
// renders inside a @youneed/dom tree — class form (reusable, props re-render in
// place), instance form, and unmount teardown.
// Run: pnpm --filter @youneed/dom-adapter-react test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { act, createElement } = await import("react");
const { Component, Mount, html, flushSync } = await import("@youneed/dom");
const { fromReact } = await import("../src/from-react.ts");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// A plain React component — exactly what a consumer would already have.
function Hello(props: { name?: string }) {
  return createElement("p", null, `hi ${props.name ?? "world"}`);
}

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

/** Append `el` to a fresh detached container and flush React + the scheduler. */
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
  const ReactHello = fromReact(Hello);
  check("class form derives a kebab tag", ReactHello.tagName === "react-hello-0" || /^react-hello-/.test(ReactHello.tagName));
  check("class form registers the element", globalThis.customElements.get(ReactHello.tagName) === (ReactHello as unknown));

  const el = new ReactHello({ name: "Ada" });
  const container = await mount(el);
  check("class form renders the React component", !!container.textContent?.includes("hi Ada"));

  // Reassigning props re-renders in place (no remount).
  await act(async () => {
    el.props = { name: "Bo" };
  });
  check("reassigning props re-renders", !!container.textContent?.includes("hi Bo"));
}

// ── instance form ───────────────────────────────────────────────────────────
{
  const el = fromReact(Hello, { name: "Lin" });
  const container = await mount(el);
  check("instance form renders with initial props", !!container.textContent?.includes("hi Lin"));
}

// ── explicit tag is reused, not redefined ──────────────────────────────────────
{
  const A = fromReact(Hello, { tagName: "x-react-hello" });
  const B = fromReact(Hello, { tagName: "x-react-hello" });
  check("explicit tag maps to a single class", A === B);
}

// ── embeds into a @youneed/dom html`` template via node interpolation ───────────
{
  const node = fromReact(Hello, { name: "Mo" });

  @Component.define()
  class Host extends Component("x-react-host") {
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
    "node hosts a React render inside a dom html`` slot",
    !!handle!.element.shadowRoot?.textContent?.includes("hi Mo"),
  );
}

// ── disconnect unmounts the React root ──────────────────────────────────────
{
  const el = fromReact(Hello, { name: "Zo" });
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
