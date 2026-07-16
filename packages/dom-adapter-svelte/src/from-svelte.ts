// Svelte ⇄ @youneed/dom bridge (the other direction).
//
// `fromSvelte` wraps an existing Svelte 5 component as a custom element so you can
// drop it straight into a `@youneed/dom` tree — no rewrite, no porting. The host
// owns a Svelte instance (mounted via Svelte 5's `mount`), renders the component
// into itself, and re-dispatches the callback props you nominate as DOM CustomEvents.
//
//   import { fromSvelte } from "@youneed/dom-adapter-svelte";
//   import Chart from "./Chart.svelte";
//
//   const SvelteChart = fromSvelte(Chart, { events: ["select"] });  // ← a class
//   // …then in a @youneed/dom template (one lowercase `.props` binding — see note):
//   html`<${SvelteChart.tagName} .props=${{ data }} @select=${onSelect}></${SvelteChart.tagName}>`;
//
//   fromSvelte(Chart, { data })                     // ← a ready instance (a Node)
//   // drop it into any html`` slot: html`<section>${fromSvelte(Chart, { data })}</section>`
//
// Two forms, mirroring `toSvelte`'s split:
//   • fromSvelte(Comp, options?) → a custom-element CLASS (auto-registered,
//                                  greppable, carries `.tagName`). Reuse it; update
//                                  `.props` to push new props.
//   • fromSvelte(Comp, props)    → a configured INSTANCE (a live element) you embed
//                                  directly.
//
// Events: Svelte 5 components surface "events" as callback props (`onselect={…}`).
// List the ones to forward via `events: ["select", …]` — each becomes a bubbling,
// composed `CustomEvent` of that name (with `event.detail` set to the callback's
// first argument), wired through the `on<name>` callback prop. The dom side then
// listens the native way (`@select` in a template).
//
// Reactive prop updates: Svelte 5 has no runtime API to push fresh props into a
// mounted component without a compiler-built `$state` proxy (unavailable to a
// plain-JS bridge), so reassigning `.props` re-mounts the component. Prefer keeping
// state inside the Svelte component, or set props once at construction.
//
// `svelte` is a PEER dependency and is imported *dynamically* on the first mount,
// so apps that only use `toSvelte` never pull Svelte's runtime into their bundle.

// ── public types ──────────────────────────────────────────────────────────────

/** A custom element that hosts a Svelte render; its `props` drive that render. */
export interface SvelteHostElement<P> extends HTMLElement {
  /** The props handed to the wrapped component. Reassign to re-render (remounts). */
  props: P;
}

/** The custom-element class produced by `fromSvelte(Comp)`. Constructible with
 *  optional initial props, and it carries the tag it was registered under — so it
 *  slots into `toSvelte`, `html` templates and "find references" the same way a
 *  native `@youneed/dom` component does. */
export interface SvelteHostClass<P> {
  new (props?: P): SvelteHostElement<P>;
  readonly tagName: string;
}

/** A Svelte 5 component (the value a `.svelte` file default-exports). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SvelteComponent = any;

/** Options for the generated host element. */
export interface FromSvelteOptions {
  /** Tag to register under. Auto-derived from the component name when omitted; pass
   *  one explicitly for a stable, predictable tag (e.g. SSR markup). */
  tagName?: string;
  /** Render into a shadow root instead of light DOM. Default `false` — Svelte
   *  manages the host's own children, which is what most integrations want. */
  shadow?: boolean;
  /** Callback-prop event names to forward as DOM CustomEvents. `["select"]` wires
   *  the `onselect` callback prop to dispatch a `select` CustomEvent (detail = the
   *  callback's first argument). */
  events?: string[];
}

// ── public API ────────────────────────────────────────────────────────────────

/** Wrap a Svelte component as a reusable custom-element class. */
export function fromSvelte<P extends object = Record<string, unknown>>(
  Comp: SvelteComponent,
  options?: FromSvelteOptions,
): SvelteHostClass<P>;
/** Wrap a Svelte component and immediately build a configured element (a Node). */
export function fromSvelte<P extends object = Record<string, unknown>>(
  Comp: SvelteComponent,
  props: P,
): SvelteHostElement<P>;
export function fromSvelte<P extends object>(
  Comp: SvelteComponent,
  arg?: P | FromSvelteOptions,
): SvelteHostClass<P> | SvelteHostElement<P> {
  // Disambiguate the overloads: the options bag is recognised by its own keys, so a
  // plain `{ tagName?, shadow?, events? }` is treated as options and anything else
  // (including `{}`) as initial props for the instance form.
  if (arg !== undefined && isProps(arg)) {
    const Host = define<P>(Comp, {});
    return new Host(arg as P);
  }
  return define<P>(Comp, (arg as FromSvelteOptions) ?? {});
}

// ── internals ───────────────────────────────────────────────────────────────

const OPTION_KEYS = new Set(["tagName", "shadow", "events"]);

/** True when `arg` should be read as props rather than the options bag. */
function isProps(arg: object): boolean {
  for (const k in arg) if (!OPTION_KEYS.has(k)) return true;
  return false; // `{}`, `{ tagName }`, `{ shadow }`, `{ events }` → options
}

// Svelte's runtime, imported lazily on first mount and reused (the bridge stays out
// of bundles that only use `toSvelte`). Cached as the in-flight promise.
type SvelteRuntime = typeof import("svelte");
let runtimePromise: Promise<SvelteRuntime> | null = null;
const getRuntime = (): Promise<SvelteRuntime> => (runtimePromise ??= import("svelte"));

let counter = 0;

/** Build (and register, once) the host element class for `Comp`. */
function define<P extends object>(Comp: SvelteComponent, options: FromSvelteOptions): SvelteHostClass<P> {
  const tag = options.tagName ?? autoTag(Comp);

  // Reuse an already-registered element for this tag — defining twice throws, and a
  // stable explicit tag should map to one class across calls.
  const existing = globalThis.customElements?.get(tag);
  if (existing) return existing as unknown as SvelteHostClass<P>;

  const eventNames = options.events ?? [];

  class SvelteHost extends HTMLElement {
    static readonly tagName = tag;
    #props: P;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #instance: any = null;
    #mountEl: Element | ShadowRoot | null = null;

    constructor(props?: P) {
      super();
      this.#props = props ?? ({} as P);
    }

    get props(): P {
      return this.#props;
    }
    set props(value: P) {
      this.#props = value;
      // No runtime prop-push without a $state proxy → re-mount with fresh props.
      if (this.#mountEl) void this.#remount();
    }

    connectedCallback(): void {
      void this.#mount();
    }

    disconnectedCallback(): void {
      const instance = this.#instance;
      this.#instance = null;
      this.#mountEl = null;
      if (instance) void this.#unmount(instance);
    }

    async #mount(): Promise<void> {
      const { mount } = await getRuntime();
      if (!this.isConnected || this.#instance) return; // disconnected mid-import
      this.#mountEl = options.shadow ? (this.shadowRoot ?? this.attachShadow({ mode: "open" })) : this;

      // Forward each nominated callback prop to a DOM CustomEvent: the `onselect`
      // prop → a `select` CustomEvent with `detail` = the first callback argument.
      const callbacks: Record<string, (payload: unknown) => void> = {};
      for (const name of eventNames) {
        callbacks[onify(name)] = (payload: unknown) =>
          this.dispatchEvent(new CustomEvent(name, { detail: payload, bubbles: true, composed: true }));
      }

      this.#instance = mount(Comp, {
        target: this.#mountEl,
        props: { ...this.#props, ...callbacks },
      });
    }

    async #remount(): Promise<void> {
      const instance = this.#instance;
      this.#instance = null;
      if (instance) await this.#unmount(instance);
      if (this.isConnected) await this.#mount();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async #unmount(instance: any): Promise<void> {
      const { unmount } = await getRuntime();
      unmount(instance);
    }
  }

  globalThis.customElements?.define(tag, SvelteHost);
  return SvelteHost as unknown as SvelteHostClass<P>;
}

/** `select` → `onselect` — the callback-prop name Svelte 5 maps an event to. */
function onify(event: string): string {
  return `on${event}`;
}

/** `svelte-<component-name>-<n>` — lowercased, with a counter to stay unique even
 *  for anonymous components or two wrappers of the same component. */
function autoTag(Comp: SvelteComponent): string {
  const raw = (Comp as { name?: string }).name ?? "anon";
  const name = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // CamelCase → kebab
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return `svelte-${name || "anon"}-${counter++}`;
}
