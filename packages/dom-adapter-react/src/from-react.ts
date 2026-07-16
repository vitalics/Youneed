// React ⇄ @youneed/dom bridge (the other direction).
//
// `fromReact` wraps an existing React component as a custom element so you can
// drop it straight into a `@youneed/dom` tree — no rewrite, no porting. The host
// owns a React root, renders `<Comp {...props}/>` into it, and keeps that render
// in sync as props change.
//
//   import { fromReact } from "@youneed/dom-adapter-react";
//   import { Chart } from "some-react-charts";
//
//   const ReactChart = fromReact(Chart);            // ← a custom-element class
//   // …then in a @youneed/dom template (one lowercase `.props` binding — see note):
//   html`<${ReactChart.tagName} .props=${{ data }}></${ReactChart.tagName}>`;
//
//   fromReact(Chart, { data })                      // ← a ready instance (a Node)
//   // drop it into any html`` slot: html`<section>${fromReact(Chart, { data })}</section>`
//
// Two forms, mirroring `toReact`'s class-vs-instance split:
//   • fromReact(Comp)         → a custom-element CLASS (auto-registered, greppable,
//                               carries `.tagName`). Reuse it; update `.props` to
//                               re-render without remounting React.
//   • fromReact(Comp, props)  → a configured INSTANCE (a live element) you embed
//                               directly. Each call mounts a fresh React root.
//
// React owns everything below the host: hooks, context (wrap a Provider in the
// component you pass), and children all behave exactly as in a normal React tree.
// `props.children` is just a React child, so composition works unchanged.

import type { ComponentType } from "react";
import { createElement } from "react";
import { type Root, createRoot } from "react-dom/client";

// ── public types ──────────────────────────────────────────────────────────────

/** A custom element that hosts a React render; its `props` drive that render. */
export interface ReactHostElement<P> extends HTMLElement {
  /** The props handed to the wrapped component. Reassign to re-render in place. */
  props: P;
}

/** The custom-element class produced by `fromReact(Comp)`. Constructible with
 *  optional initial props, and it carries the tag it was registered under — so
 *  it slots into `toReact`, `html` templates and "find references" the same way
 *  a native `@youneed/dom` component does. */
export interface ReactHostClass<P> {
  new (props?: P): ReactHostElement<P>;
  readonly tagName: string;
}

/** Options for the generated host element. */
export interface FromReactOptions {
  /** Tag to register under. Auto-derived from the component name when omitted;
   *  pass one explicitly for a stable, predictable tag (e.g. SSR markup). */
  tagName?: string;
  /** Render into a shadow root instead of light DOM. Default `false` — React
   *  manages the host's own children, which is what most integrations want. */
  shadow?: boolean;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Wrap a React component as a reusable custom-element class. */
export function fromReact<P extends object>(
  Comp: ComponentType<P>,
  options?: FromReactOptions,
): ReactHostClass<P>;
/** Wrap a React component and immediately build a configured element (a Node). */
export function fromReact<P extends object>(Comp: ComponentType<P>, props: P): ReactHostElement<P>;
export function fromReact<P extends object>(
  Comp: ComponentType<P>,
  arg?: P | FromReactOptions,
): ReactHostClass<P> | ReactHostElement<P> {
  // Disambiguate the overloads: the options bag is recognised by its own keys,
  // so a plain `{ tagName?, shadow? }` is treated as options and anything else
  // (including `{}`) as initial props for the instance form.
  if (arg !== undefined && isProps(arg)) {
    const Host = define(Comp, {});
    return new Host(arg as P);
  }
  return define(Comp, (arg as FromReactOptions) ?? {});
}

// ── internals ───────────────────────────────────────────────────────────────

/** True when `arg` should be read as props rather than the options bag. */
function isProps(arg: object): boolean {
  for (const k in arg) if (k !== "tagName" && k !== "shadow") return true;
  return false; // `{}`, `{ tagName }`, `{ shadow }` → options
}

let counter = 0;

/** Build (and register, once) the host element class for `Comp`. */
function define<P extends object>(
  Comp: ComponentType<P>,
  options: FromReactOptions,
): ReactHostClass<P> {
  const tag = options.tagName ?? autoTag(Comp);

  // Reuse an already-registered element for this tag — defining twice throws,
  // and a stable explicit tag should map to one class across calls.
  const existing = globalThis.customElements?.get(tag);
  if (existing) return existing as unknown as ReactHostClass<P>;

  class ReactHost extends HTMLElement {
    static readonly tagName = tag;
    #root: Root | null = null;
    #props: P;

    constructor(props?: P) {
      super();
      this.#props = props ?? ({} as P);
    }

    get props(): P {
      return this.#props;
    }
    set props(value: P) {
      this.#props = value;
      this.#render();
    }

    connectedCallback(): void {
      const mount = options.shadow ? this.attachShadow({ mode: "open" }) : this;
      this.#root = createRoot(mount as unknown as Element | DocumentFragment);
      this.#render();
    }

    disconnectedCallback(): void {
      // Unmount async so we don't tear down a root mid-React-render.
      const root = this.#root;
      this.#root = null;
      if (root) queueMicrotask(() => root.unmount());
    }

    #render(): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.#root?.render(createElement(Comp as ComponentType<any>, this.#props));
    }
  }

  globalThis.customElements?.define(tag, ReactHost);
  return ReactHost as unknown as ReactHostClass<P>;
}

/** `react-<component-name>-<n>` — lowercased, with a counter to stay unique even
 *  for anonymous components or two wrappers of the same component. */
function autoTag(Comp: { displayName?: string; name?: string }): string {
  const name = (Comp.displayName || Comp.name || "anon")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // CamelCase → kebab
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return `react-${name || "anon"}-${counter++}`;
}
