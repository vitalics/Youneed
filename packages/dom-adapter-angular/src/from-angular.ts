// Angular ⇄ @youneed/dom bridge (the other direction).
//
// `fromAngular` wraps an existing Angular component as a custom element so you
// can drop it straight into a `@youneed/dom` tree — no rewrite, no porting. The
// host owns a tiny zoneless Angular application, renders the component into
// itself, keeps its `@Input()`s in sync with `props`, and re-dispatches each
// `@Output()` as a DOM `CustomEvent` (so the dom side listens the native way).
//
//   import { fromAngular } from "@youneed/dom-adapter-angular";
//   import { ChartComponent } from "some-angular-charts";
//
//   const NgChart = fromAngular(ChartComponent);     // ← a custom-element class
//   // …then in a @youneed/dom template (one lowercase `.props` binding — see note):
//   html`<${NgChart.tagName} .props=${{ data }} @select=${onSelect}></${NgChart.tagName}>`;
//
//   fromAngular(ChartComponent, { data })            // ← a ready instance (a Node)
//   // drop it into any html`` slot: html`<section>${fromAngular(ChartComponent, { data })}</section>`
//
// Two forms, mirroring `toAngular`'s class-vs-instance split:
//   • fromAngular(Comp)         → a custom-element CLASS (auto-registered, greppable,
//                                 carries `.tagName`). Reuse it; update `.props` to
//                                 re-render in place without remounting Angular.
//   • fromAngular(Comp, props)  → a configured INSTANCE (a live element) you embed
//                                 directly.
//
// Angular owns everything below the host: change detection (zoneless — flushed on
// each input change), DI (a shared `EnvironmentInjector` backs every host), and the
// component's own template. `@Output()` events surface as bubbling, composed
// `CustomEvent`s named after the output's public name, with `event.detail` set to
// the emitted value. To fire one yourself (tests, imperative wiring) use `emit`.
//
// `@angular/core` and `@angular/platform-browser` are PEER deps and are imported
// *dynamically* on first mount, so apps that only use `toAngular`/`emit` never
// pull Angular into their bundle.

import type {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  Type,
} from "@angular/core";

// ── public types ──────────────────────────────────────────────────────────────

/** A custom element that hosts an Angular component render; its `props` drive the
 *  component's `@Input()`s. */
export interface AngularHostElement<P> extends HTMLElement {
  /** The inputs handed to the wrapped component. Reassign to re-render in place. */
  props: P;
}

/** The custom-element class produced by `fromAngular(Comp)`. Constructible with
 *  optional initial props, and it carries the tag it was registered under — so it
 *  slots into `toAngular`, `html` templates and "find references" the same way a
 *  native `@youneed/dom` component does. */
export interface AngularHostClass<P> {
  new (props?: P): AngularHostElement<P>;
  readonly tagName: string;
}

/** Options for the generated host element. */
export interface FromAngularOptions {
  /** Tag to register under. Auto-derived from the component name when omitted;
   *  pass one explicitly for a stable, predictable tag (e.g. SSR markup). */
  tagName?: string;
  /** Render into a shadow root instead of light DOM. Default `false` — Angular
   *  manages the host's own children, which is what most integrations want. */
  shadow?: boolean;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Wrap an Angular component as a reusable custom-element class. */
export function fromAngular<T>(
  Comp: Type<T>,
  options?: FromAngularOptions,
): AngularHostClass<Partial<T>>;
/** Wrap an Angular component and immediately build a configured element (a Node). */
export function fromAngular<T>(Comp: Type<T>, props: Partial<T>): AngularHostElement<Partial<T>>;
export function fromAngular<T>(
  Comp: Type<T>,
  arg?: Partial<T> | FromAngularOptions,
): AngularHostClass<Partial<T>> | AngularHostElement<Partial<T>> {
  // Disambiguate the overloads: the options bag is recognised by its own keys,
  // so a plain `{ tagName?, shadow? }` is treated as options and anything else
  // (including `{}`) as initial props for the instance form.
  if (arg !== undefined && isProps(arg)) {
    const Host = define(Comp, {});
    return new Host(arg as Partial<T>);
  }
  return define(Comp, (arg as FromAngularOptions) ?? {});
}

// ── internals ───────────────────────────────────────────────────────────────

/** True when `arg` should be read as props rather than the options bag. */
function isProps(arg: object): boolean {
  for (const k in arg) if (k !== "tagName" && k !== "shadow") return true;
  return false; // `{}`, `{ tagName }`, `{ shadow }` → options
}

// One shared zoneless Angular application backs every host — created lazily on the
// first mount, then reused (its `EnvironmentInjector` is what `createComponent`
// needs). Cached as the in-flight promise so concurrent mounts share one bootstrap.
let appRefPromise: Promise<ApplicationRef> | null = null;

async function getInjector(): Promise<{ app: ApplicationRef; injector: EnvironmentInjector }> {
  if (!appRefPromise) {
    appRefPromise = (async () => {
      const { provideZonelessChangeDetection } = await import("@angular/core");
      const { createApplication } = await import("@angular/platform-browser");
      return createApplication({ providers: [provideZonelessChangeDetection()] });
    })();
  }
  const app = await appRefPromise;
  return { app, injector: app.injector };
}

let counter = 0;

/** Build (and register, once) the host element class for `Comp`. */
function define<T>(Comp: Type<T>, options: FromAngularOptions): AngularHostClass<Partial<T>> {
  const tag = options.tagName ?? autoTag(Comp);

  // Reuse an already-registered element for this tag — defining twice throws,
  // and a stable explicit tag should map to one class across calls.
  const existing = globalThis.customElements?.get(tag);
  if (existing) return existing as unknown as AngularHostClass<Partial<T>>;

  type P = Partial<T>;

  class AngularHost extends HTMLElement {
    static readonly tagName = tag;
    #props: P;
    #ref: ComponentRef<T> | null = null;
    #app: ApplicationRef | null = null;
    #connected = false;
    #subs: Array<{ unsubscribe(): void }> = [];

    constructor(props?: P) {
      super();
      this.#props = props ?? ({} as P);
    }

    get props(): P {
      return this.#props;
    }
    set props(value: P) {
      this.#props = value;
      this.#applyInputs();
    }

    connectedCallback(): void {
      this.#connected = true;
      void this.#mount();
    }

    disconnectedCallback(): void {
      this.#connected = false;
      this.#teardown();
    }

    async #mount(): Promise<void> {
      const { createComponent } = await import("@angular/core");
      const { app, injector } = await getInjector();
      // Disconnected (or already mounted) while we were bootstrapping — bail.
      if (!this.#connected || this.#ref) return;

      const hostElement = options.shadow
        ? this.#shadowHost()
        : (this as unknown as Element);
      const ref = createComponent(Comp, { environmentInjector: injector, hostElement });
      this.#ref = ref;
      this.#app = app;
      app.attachView(ref.hostView);
      this.#wireOutputs(ref);
      this.#applyInputs();
    }

    /** A child element inside the shadow root for Angular to render into. */
    #shadowHost(): Element {
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      const host = document.createElement("div");
      root.appendChild(host);
      return host;
    }

    /** Push `#props` onto the component: declared `@Input()`s via `setInput`
     *  (the change-detection-aware path), anything else as a plain property. */
    #applyInputs(): void {
      const ref = this.#ref;
      if (!ref) return;
      const instance = ref.instance as unknown as Record<string, unknown>;
      for (const key in this.#props) {
        const value = (this.#props as Record<string, unknown>)[key];
        try {
          ref.setInput(key, value); // throws NG0303 if `key` isn't an input
        } catch {
          instance[key] = value; // not a declared input — set it directly
        }
      }
      ref.changeDetectorRef.detectChanges();
    }

    /** Subscribe to every `@Output()` EventEmitter and re-dispatch it as a DOM
     *  `CustomEvent` named after the output's public name (`detail` = the value). */
    #wireOutputs(ref: ComponentRef<T>): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outputs: Record<string, string> = (Comp as any).ɵcmp?.outputs ?? {};
      const instance = ref.instance as unknown as Record<string, { subscribe?(fn: (v: unknown) => void): { unsubscribe(): void } }>;
      for (const classProp in outputs) {
        const emitter = instance[classProp];
        if (!emitter?.subscribe) continue;
        const eventName = outputs[classProp];
        this.#subs.push(
          emitter.subscribe((detail) => {
            this.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true, composed: true }));
          }),
        );
      }
    }

    #teardown(): void {
      for (const sub of this.#subs) sub.unsubscribe();
      this.#subs = [];
      const ref = this.#ref;
      const app = this.#app;
      this.#ref = null;
      this.#app = null;
      if (ref) {
        // Detach async so we never tear a view down mid-change-detection.
        queueMicrotask(() => {
          app?.detachView(ref.hostView);
          ref.destroy();
        });
      }
    }
  }

  globalThis.customElements?.define(tag, AngularHost);
  return AngularHost as unknown as AngularHostClass<P>;
}

/** `ng-<component-name>-<n>` — lowercased, with a counter to stay unique even for
 *  two wrappers of the same component. */
function autoTag(Comp: { name?: string }): string {
  const name = (Comp.name || "anon")
    .replace(/Component$/, "") // a trailing `Component` is noise in a tag
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // CamelCase → kebab
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return `ng-${name || "anon"}-${counter++}`;
}
