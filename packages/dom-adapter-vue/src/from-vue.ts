// Vue ⇄ @youneed/dom bridge (the other direction).
//
// `fromVue` wraps an existing Vue component as a custom element so you can drop it
// straight into a `@youneed/dom` tree — no rewrite, no porting. The host owns a Vue
// app, renders `<Comp v-bind="props"/>` into it, keeps that render in sync as props
// change, and re-dispatches the component's declared `emits` as DOM CustomEvents.
//
//   import { fromVue } from "@youneed/dom-adapter-vue";
//   import Chart from "some-vue-charts";
//
//   const VueChart = fromVue(Chart);                // ← a custom-element class
//   // …then in a @youneed/dom template (one lowercase `.props` binding — see note):
//   html`<${VueChart.tagName} .props=${{ data }} @select=${onSelect}></${VueChart.tagName}>`;
//
//   fromVue(Chart, { data })                        // ← a ready instance (a Node)
//   // drop it into any html`` slot: html`<section>${fromVue(Chart, { data })}</section>`
//
// Two forms, mirroring `toVue`'s class-vs-instance split:
//   • fromVue(Comp)         → a custom-element CLASS (auto-registered, greppable,
//                             carries `.tagName`). Reuse it; update `.props` to
//                             re-render without remounting Vue.
//   • fromVue(Comp, props)  → a configured INSTANCE (a live element) you embed
//                             directly.
//
// Vue owns everything below the host: reactivity, provide/inject (wrap a provider
// in the component you pass), and slots. Each `emit('foo', payload)` the component
// declares in `emits` surfaces as a bubbling, composed `CustomEvent` named `foo`
// with `event.detail` set to the payload — so the dom side listens the native way.
//
// `vue` is a PEER dependency and is imported *dynamically* on the first mount, so
// apps that only use `toVue` never pull a second Vue copy into their bundle.

import type { App, Component } from "vue";

// ── public types ──────────────────────────────────────────────────────────────

/** A custom element that hosts a Vue render; its `props` drive that render. */
export interface VueHostElement<P> extends HTMLElement {
  /** The props handed to the wrapped component. Reassign to re-render in place. */
  props: P;
}

/** The custom-element class produced by `fromVue(Comp)`. Constructible with optional
 *  initial props, and it carries the tag it was registered under — so it slots into
 *  `toVue`, `html` templates and "find references" the same way a native
 *  `@youneed/dom` component does. */
export interface VueHostClass<P> {
  new (props?: P): VueHostElement<P>;
  readonly tagName: string;
}

/** Options for the generated host element. */
export interface FromVueOptions {
  /** Tag to register under. Auto-derived from the component name when omitted; pass
   *  one explicitly for a stable, predictable tag (e.g. SSR markup). */
  tagName?: string;
  /** Render into a shadow root instead of light DOM. Default `false` — Vue manages
   *  the host's own children, which is what most integrations want. */
  shadow?: boolean;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Wrap a Vue component as a reusable custom-element class. */
export function fromVue<P extends object = Record<string, unknown>>(
  Comp: Component,
  options?: FromVueOptions,
): VueHostClass<P>;
/** Wrap a Vue component and immediately build a configured element (a Node). */
export function fromVue<P extends object = Record<string, unknown>>(
  Comp: Component,
  props: P,
): VueHostElement<P>;
export function fromVue<P extends object>(
  Comp: Component,
  arg?: P | FromVueOptions,
): VueHostClass<P> | VueHostElement<P> {
  // Disambiguate the overloads: the options bag is recognised by its own keys, so a
  // plain `{ tagName?, shadow? }` is treated as options and anything else (including
  // `{}`) as initial props for the instance form.
  if (arg !== undefined && isProps(arg)) {
    const Host = define<P>(Comp, {});
    return new Host(arg as P);
  }
  return define<P>(Comp, (arg as FromVueOptions) ?? {});
}

// ── internals ───────────────────────────────────────────────────────────────

/** True when `arg` should be read as props rather than the options bag. */
function isProps(arg: object): boolean {
  for (const k in arg) if (k !== "tagName" && k !== "shadow") return true;
  return false; // `{}`, `{ tagName }`, `{ shadow }` → options
}

// Vue's runtime, imported lazily on first mount and reused (the bridge stays
// out of bundles that only use `toVue`). Cached as the in-flight promise.
type VueRuntime = typeof import("vue");
let runtimePromise: Promise<VueRuntime> | null = null;
const getRuntime = (): Promise<VueRuntime> => (runtimePromise ??= import("vue"));

let counter = 0;

/** Build (and register, once) the host element class for `Comp`. */
function define<P extends object>(Comp: Component, options: FromVueOptions): VueHostClass<P> {
  const tag = options.tagName ?? autoTag(Comp);

  // Reuse an already-registered element for this tag — defining twice throws, and a
  // stable explicit tag should map to one class across calls.
  const existing = globalThis.customElements?.get(tag);
  if (existing) return existing as unknown as VueHostClass<P>;

  // The component's declared `emits`, as event names → forwarded to DOM events.
  const emitNames = emitsOf(Comp);

  class VueHost extends HTMLElement {
    static readonly tagName = tag;
    #props: P;
    #state: Record<string, unknown> | null = null;
    #app: App | null = null;

    constructor(props?: P) {
      super();
      this.#props = props ?? ({} as P);
    }

    get props(): P {
      return this.#props as P;
    }
    set props(value: P) {
      this.#props = value;
      this.#sync();
    }

    connectedCallback(): void {
      void this.#mount();
    }

    disconnectedCallback(): void {
      // Unmount async so we don't tear down an app mid-render.
      const app = this.#app;
      this.#app = null;
      this.#state = null;
      if (app) queueMicrotask(() => app.unmount());
    }

    async #mount(): Promise<void> {
      const { createApp, reactive, h } = await getRuntime();
      if (!this.isConnected || this.#app) return; // disconnected mid-import

      const state = reactive({ ...this.#props } as Record<string, unknown>);
      this.#state = state;

      // Forward each declared emit to a DOM CustomEvent: `emit('select', v)` →
      // a `select` CustomEvent with `detail = v`.
      const listeners: Record<string, (payload: unknown) => void> = {};
      for (const name of emitNames) {
        listeners[onify(name)] = (payload: unknown) =>
          this.dispatchEvent(new CustomEvent(name, { detail: payload, bubbles: true, composed: true }));
      }

      const app = createApp({
        render: () => h(Comp as never, { ...state, ...listeners }),
      });
      this.#app = app;
      const mount = options.shadow ? (this.shadowRoot ?? this.attachShadow({ mode: "open" })) : this;
      app.mount(mount as Element);
    }

    /** Push `#props` onto the reactive state: add/replace incoming keys, drop ones
     *  that disappeared, so the wrapped component re-renders in place. */
    #sync(): void {
      const state = this.#state;
      if (!state) return;
      const next = this.#props as Record<string, unknown>;
      for (const k in state) if (!(k in next)) delete state[k];
      Object.assign(state, next);
    }
  }

  globalThis.customElements?.define(tag, VueHost);
  return VueHost as unknown as VueHostClass<P>;
}

/** A component's declared `emits` as a flat list of event names (array or object
 *  form). Undeclared emits can't be discovered, so they aren't forwarded. */
function emitsOf(Comp: Component): string[] {
  const emits = (Comp as { emits?: string[] | Record<string, unknown> }).emits;
  if (!emits) return [];
  return Array.isArray(emits) ? emits : Object.keys(emits);
}

/** `select` → `onSelect` — the listener-prop name Vue maps an emit to. */
function onify(event: string): string {
  return `on${event[0].toUpperCase()}${event.slice(1)}`;
}

/** `vue-<component-name>-<n>` — lowercased, with a counter to stay unique even for
 *  anonymous components or two wrappers of the same component. */
function autoTag(Comp: Component): string {
  const raw = (Comp as { name?: string; __name?: string }).name ?? (Comp as { __name?: string }).__name ?? "anon";
  const name = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // CamelCase → kebab
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return `vue-${name || "anon"}-${counter++}`;
}
