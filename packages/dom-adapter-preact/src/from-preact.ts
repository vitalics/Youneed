// Preact ⇄ @youneed/dom bridge (the other direction).
//
// `fromPreact` wraps an existing Preact component as a custom element so you can
// drop it straight into a `@youneed/dom` tree — no rewrite, no porting. The host
// renders `<Comp {...props}/>` into itself and keeps that render in sync as props
// change.
//
//   import { fromPreact } from "@youneed/dom-adapter-preact";
//   import { Chart } from "some-preact-charts";
//
//   const PreactChart = fromPreact(Chart);          // ← a custom-element class
//   // …then in a @youneed/dom template (one lowercase `.props` binding — see note):
//   html`<${PreactChart.tagName} .props=${{ data }}></${PreactChart.tagName}>`;
//
//   fromPreact(Chart, { data })                     // ← a ready instance (a Node)
//   // drop it into any html`` slot: html`<section>${fromPreact(Chart, { data })}</section>`
//
// Two forms, mirroring `toPreact`'s class-vs-instance split:
//   • fromPreact(Comp)         → a custom-element CLASS (auto-registered, greppable,
//                                carries `.tagName`). Reuse it; update `.props` to
//                                re-render without remounting Preact.
//   • fromPreact(Comp, props)  → a configured INSTANCE (a live element) you embed
//                                directly.
//
// Preact owns everything below the host: hooks, context (wrap a Provider in the
// component you pass), and children all behave exactly as in a normal Preact tree.
// `props.children` is just a Preact child, so composition works unchanged.

import type { AnyComponent } from "preact";
import { createElement, render } from "preact";

// ── public types ──────────────────────────────────────────────────────────────

/** A custom element that hosts a Preact render; its `props` drive that render. */
export interface PreactHostElement<P> extends HTMLElement {
  /** The props handed to the wrapped component. Reassign to re-render in place. */
  props: P;
}

/** The custom-element class produced by `fromPreact(Comp)`. Constructible with
 *  optional initial props, and it carries the tag it was registered under — so
 *  it slots into `toPreact`, `html` templates and "find references" the same way
 *  a native `@youneed/dom` component does. */
export interface PreactHostClass<P> {
  new (props?: P): PreactHostElement<P>;
  readonly tagName: string;
}

/** Options for the generated host element. */
export interface FromPreactOptions {
  /** Tag to register under. Auto-derived from the component name when omitted;
   *  pass one explicitly for a stable, predictable tag (e.g. SSR markup). */
  tagName?: string;
  /** Render into a shadow root instead of light DOM. Default `false` — Preact
   *  manages the host's own children, which is what most integrations want. */
  shadow?: boolean;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Wrap a Preact component as a reusable custom-element class. */
export function fromPreact<P extends object>(
  Comp: AnyComponent<P>,
  options?: FromPreactOptions,
): PreactHostClass<P>;
/** Wrap a Preact component and immediately build a configured element (a Node). */
export function fromPreact<P extends object>(Comp: AnyComponent<P>, props: P): PreactHostElement<P>;
export function fromPreact<P extends object>(
  Comp: AnyComponent<P>,
  arg?: P | FromPreactOptions,
): PreactHostClass<P> | PreactHostElement<P> {
  // Disambiguate the overloads: the options bag is recognised by its own keys,
  // so a plain `{ tagName?, shadow? }` is treated as options and anything else
  // (including `{}`) as initial props for the instance form.
  if (arg !== undefined && isProps(arg)) {
    const Host = define(Comp, {});
    return new Host(arg as P);
  }
  return define(Comp, (arg as FromPreactOptions) ?? {});
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
  Comp: AnyComponent<P>,
  options: FromPreactOptions,
): PreactHostClass<P> {
  const tag = options.tagName ?? autoTag(Comp);

  // Reuse an already-registered element for this tag — defining twice throws,
  // and a stable explicit tag should map to one class across calls.
  const existing = globalThis.customElements?.get(tag);
  if (existing) return existing as unknown as PreactHostClass<P>;

  class PreactHost extends HTMLElement {
    static readonly tagName = tag;
    #mount: Element | DocumentFragment | null = null;
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
      this.#mount = options.shadow ? this.attachShadow({ mode: "open" }) : this;
      this.#render();
    }

    disconnectedCallback(): void {
      // Unmount async so we don't tear down a tree mid-render. Rendering `null`
      // into the same container is Preact's unmount.
      const mount = this.#mount;
      this.#mount = null;
      if (mount) queueMicrotask(() => render(null, mount));
    }

    #render(): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (this.#mount) render(createElement(Comp as AnyComponent<any>, this.#props), this.#mount);
    }
  }

  globalThis.customElements?.define(tag, PreactHost);
  return PreactHost as unknown as PreactHostClass<P>;
}

/** `preact-<component-name>-<n>` — lowercased, with a counter to stay unique even
 *  for anonymous components or two wrappers of the same component. */
function autoTag(Comp: { displayName?: string; name?: string }): string {
  const name = (Comp.displayName || Comp.name || "anon")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // CamelCase → kebab
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return `preact-${name || "anon"}-${counter++}`;
}
