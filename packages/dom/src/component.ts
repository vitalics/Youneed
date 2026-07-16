// component.ts — the reactive component core: the reactive() mixin, the
// Reactive base class (lifecycle, rendering, signals/task bridge, devtools),
// the Component() factory, error-boundary plumbing, and Mount. Decorators live
// in ./decorators.ts and are attached to Component below.
import {
  type Priority,
  type Scheduler,
  type SchedulerHost,
  rafScheduler,
  getDefaultScheduler,
} from "@youneed/dom-scheduler";
import type { Constructor } from "@youneed/core";
import {
  compileTemplate,
  bindParts,
  appendSlot,
  getStyles,
  getLazyStyles,
  loadLazySheet,
  normalizeStyles,
  toStyleSheets,
  externalProps,
  setCurrentHost,
  getCurrentHost,
  EventPart,
} from "./template.ts";
import type {
  TemplateResult,
  Part,
  SlotContent,
  StyleInput,
  StyleEntry,
  LazyStyle,
} from "./template.ts";
import { createSignal, createComputed, createEffect } from "./signals.ts";
import type { Signal, ReadonlySignal, SignalOptions } from "./signals.ts";
import { task } from "./task.ts";
import type { Task, TaskOptions } from "./task.ts";
import {
  getReactiveProps,
  getExposedEvents,
  attrPropMap,
  reflectPropMap,
  getWatchers,
  rendersCompiled,
  define,
  propDecorator,
  eventDecorator,
  watchDecorator,
  defineDecorator,
  compileDecorator,
  computedDecorator,
} from "./decorators.ts";

function flushSync(): void {
  getDefaultScheduler().flushSync();
}

// ============================================================
// Devtools instrumentation (opt-in, zero-cost when absent)
// ------------------------------------------------------------
// Components emit lifecycle/state/event records to a global hook if one is
// installed (see dom-devtools.ts). No hook -> a single nullish check, nothing
// is built. Wired via globalThis so it works across bundles.
// ============================================================

/** A bound event listener — `listen()` subscriptions + template `@event` handlers. */
interface ListenerInfo {
  /** Event type, e.g. "click", "mousemove". */
  type: string;
  /** Human-readable target, e.g. "window", "document", "<button>". */
  target: string;
  /** Where it came from: an explicit `this.listen()` or a template binding. */
  source: "listen" | "template";
}

/** A scoped CSS rule and whether it currently matches anything (applied). */
interface StyleRule {
  selector: string;
  cssText: string;
  applied: boolean;
}

interface DevtoolsEvent {
  kind: "mount" | "update" | "unmount" | "emit";
  id: number;
  tag: string;
  time: number;
  version?: number;
  props?: Record<string, unknown>;
  styles?: StyleRule[];
  emit?: { type: string; detail: unknown };
  /** Nearest ancestor component's id — lets the inspector build the tree. */
  parentId?: number;
  /** Live element reference (mount only) — for on-page highlighting. */
  el?: Element;
  /** Event names the component exposes via `@Component.event` (mount only). */
  exposed?: string[];
  /** Active event listeners (mount/update) — Chrome-DevTools-style listing. */
  listeners?: ListenerInfo[];
  /** Scheduler in effect for this component (its `name`). */
  scheduler?: string;
  /** Live scheduler object — lets the inspector offer the app's real schedulers. */
  schedulerRef?: Scheduler;
  /** Default update priority for this component. */
  priority?: Priority;
}

interface DevtoolsHook {
  send(event: DevtoolsEvent): void;
}

let instanceCounter = 0;

// Element -> component id, so a child can find its nearest component ancestor
// by climbing the DOM (across shadow boundaries) — same walk as `depth`.
const devtoolsIds = new WeakMap<Node, number>();

// Element -> the props it was constructed with (`new View({…})` / `View.of`).
// Server-side only: lets the SSR layer serialize props for client hydration.
const hydrationData = new WeakMap<Element, Record<string, unknown>>();

/** Props an element was created with (for SSR serialization). */
function getHydrationProps(el: Element): Record<string, unknown> | undefined {
  return hydrationData.get(el);
}

/**
 * Client-side hydration: read `<script type="application/json" data-hydrate>`
 * blocks ({ tag, props }) emitted during SSR and apply the props to matching
 * elements. Assigning a reactive @prop re-renders with the data — whether the
 * element is already upgraded or upgrades later. Call once on the client.
 */
function hydrate(root: ParentNode = document): void {
  for (const script of root.querySelectorAll("script[data-hydrate]")) {
    let payload: { tag: string; props: Record<string, unknown> };
    try {
      payload = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    for (const el of root.querySelectorAll(payload.tag)) {
      Object.assign(el, payload.props);
    }
  }
}

function devtoolsHook(): DevtoolsHook | undefined {
  return (globalThis as { __DOM_DEVTOOLS__?: DevtoolsHook }).__DOM_DEVTOOLS__;
}

/** Readable label for a listener target, for the devtools listing. Identity
 *  checks (not instanceof) so it's robust across realms / happy-dom. */
function describeTarget(target: EventTarget): string {
  if (typeof window !== "undefined" && target === window) return "window";
  if (typeof document !== "undefined" && target === document) return "document";
  if (target instanceof Element) {
    const tag = target.tagName.toLowerCase();
    return target.id ? `<${tag}#${target.id}>` : `<${tag}>`;
  }
  const name = (target as { constructor?: { name?: string } }).constructor
    ?.name;
  return name && name !== "Object" ? name : "target";
}

// ============================================================
// Reactive element — a mixin over ANY HTMLElement base
// ============================================================

/** Data-property subset of a component (methods excluded) — the shape accepted
 *  by `new View({...})`. Used with polymorphic `this` for per-subclass typing. */
type ComponentProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  [K in keyof T as T[K] extends Function ? never : K]?: T[K];
};

/** A component's PUBLIC prop shape. If the component declares a `_typed_props`
 *  contract anchor (`_typed_props!: Props` — a TS-only phantom, see Component()),
 *  that curated type is the contract; otherwise it's all the component's data
 *  fields. Used by `.of()` and {@link PropsOf}. */
type PublicProps<T> = T extends { _typed_props: infer P } ? P : ComponentProps<T>;

/** The public prop shape of a component CLASS — its `_typed_props` contract if it
 *  declares one, else its data fields. Handy for typing JSX intrinsic elements,
 *  the React adapter, or any consumer that hands the component props:
 *  `PropsOf<typeof Toggle>` → `{ enabled?, … }`. */
export type PropsOf<C extends { prototype: unknown }> = C extends {
  prototype: infer I;
}
  ? PublicProps<I>
  : never;

/** Any string, but a union with literals still shows those literals in editor
 *  autocomplete (the classic `string & {}` trick, retaining `length`). */
type AnyString<S extends string = string> = string & {
  [key: number]: string;
  length: S["length"];
};

/** Names of a component's data properties (no methods) — for typed getAttribute. */
type PropNames<T> = keyof ComponentProps<T> & string;


/** Surface that `task()` / computed rely on, regardless of the concrete base. */
interface ReactiveHost {
  requestUpdate(priority?: Priority): void;
  /** Swap this instance's scheduler at runtime (undefined reverts to default). */
  setScheduler(scheduler?: Scheduler): void;
  /** This instance's live scoped stylesheets (mutate in place to restyle). */
  getStyles(): CSSStyleSheet[];
  /** Replace this instance's scoped styles at runtime (per-instance). */
  setStyles(input: StyleInput | StyleInput[]): void;
  /** Light-DOM children projected into the component's `<slot>`. */
  slotted(): Element[];
  /** Register teardown run on disconnect (event unsubscribe, intervals, …). */
  onCleanup(teardown: () => void): void;
  /** Per-frame game-loop tick (dt in ms) on this host's scheduler; auto-stops. */
  onFrame(callback: (dt: number) => void): () => void;
  /** Flush this host's scheduler synchronously. */
  flushSync(): void;
  /** AbortSignal that fires on disconnect — pass to addEventListener/fetch/task. */
  readonly abortSignal: AbortSignal;
  /** Reactive value bound to this host: writing it schedules a re-render.
   *  Auto-disposed on disconnect. */
  signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>;
  /** Memoized derived signal (recomputes when its signal deps change). */
  computed<T>(compute: () => T, options?: SignalOptions<T>): ReadonlySignal<T>;
  /** Reactive effect bound to this host; auto-stops on disconnect. */
  effect(fn: () => void | (() => void)): () => void;
  readonly version: number;
  /** Explicit resource disposal (TC39 `using`) — tears down like disconnect. */
  [Symbol.dispose](): void;
}

// Angular-style lifecycle interfaces. The hooks are optional (default no-op),
// but declaring `implements OnMount` makes the compiler require the method —
// and catches typos like `onMounted` that would otherwise silently never run.
//
//   class Clock extends Component("x-clock") implements OnMount, OnUnmount {
//     onMount() { … }
//     onUnmount() { … }
//   }

/** Require an `onMount()` hook (runs once after the first render). */
interface OnMount {
  onMount(): void;
}
/** Require an `onUpdate()` hook (runs after every re-render except the first). */
interface OnUpdate {
  onUpdate(): void;
}
/** Require an `onUnmount()` hook (runs on disconnect / disposal). */
interface OnUnmount {
  onUnmount(): void;
}

// ── error boundary ───────────────────────────────────────────────────────────
// Each component renders independently (its own scheduler tick), so a throw in
// one component's render()/lifecycle is CONTAINED to that component: it's caught,
// routed to the component's `onError` hook (a per-component boundary) or the
// global handler, and never aborts the scheduler batch — sibling components keep
// rendering. (This is "self-containment", not a tree-wide React error boundary,
// because there's no synchronous parent→child render call to wrap.)

/** Lifecycle phase an error was caught in. */
export type ErrorPhase = "render" | "mount" | "update" | "unmount";

/** Context passed to `onError` / the global error handler. */
export interface ErrorInfo {
  /** The phase the error was thrown in. */
  phase: ErrorPhase;
  /** The component's custom-element tag. */
  tag: string;
  /** The component instance that errored. */
  component: ReactiveHost;
}

/** Require an `onError()` hook — a per-component error boundary. Called when this
 *  component's `render()` or a lifecycle hook throws; set state + `requestUpdate()`
 *  to show a fallback. If it (or that fallback render) throws too, the error
 *  escalates to the global handler ({@link setErrorHandler}). */
interface OnError {
  onError(error: unknown, info: ErrorInfo): void;
}

let errorHandler: (error: unknown, info: ErrorInfo) => void = (error, info) => {
  console.error(`[${info.tag}] uncaught error during ${info.phase}:`, error);
};

/** Install the global handler for component errors not handled by an `onError`
 *  hook (or thrown by one) — wire it to your logger/telemetry. Defaults to
 *  `console.error`. Returns the previous handler. */
export function setErrorHandler(
  handler: (error: unknown, info: ErrorInfo) => void,
): (error: unknown, info: ErrorInfo) => void {
  const prev = errorHandler;
  errorHandler = handler;
  return prev;
}

/**
 * Adds reactivity + Shadow-DOM rendering to any HTMLElement base, so a
 * component can extend a shared base class (`Component(tag, Base)`).
 */
function reactive<TBase extends Constructor<HTMLElement>>(Base: TBase) {
  abstract class Reactive extends Base implements ReactiveHost, SchedulerHost {
    static tagName = "";
    /** Default update priority for this component (override per class). */
    static priority: Priority = "render-blocking";
    /** Optional per-component scheduler; falls back to the global default. */
    static scheduler?: Scheduler;
    /** Render into a Shadow DOM root (default). `false` → light-DOM mode. */
    static shadow = true;

    /** Attributes to observe — the ones declared via `@prop({ attribute })`. */
    static get observedAttributes(): string[] {
      const map = attrPropMap(this);
      return map ? Object.keys(map) : [];
    }

    /** Reflect an observed attribute into its prop (later attribute changes). */
    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      const prop = attrPropMap(this.constructor)?.[name];
      if (prop) this.#reflectAttr(prop, value);
    }

    /** Coerce an attribute string to the prop's default type and assign it. */
    #reflectAttr(prop: string, value: string | null): void {
      const self = this as unknown as Record<string, unknown>;
      const current = self[prop];
      self[prop] =
        value === null
          ? typeof current === "boolean"
            ? false
            : undefined
          : typeof current === "number"
            ? Number(value)
            : typeof current === "boolean"
              ? value !== "false"
              : value;
    }
    // `static styles` is intentionally NOT declared here: subclasses set it as a
    // fresh member (`static styles = css`…``), and getStyles() reads it at
    // runtime. Declaring it would force `override` on every component.

    // The render target: a ShadowRoot (default, scoped styles) or the element
    // itself in light-DOM mode (`Component(tag, { shadow: false })` — faster
    // mount, no style scoping/slots; the component uses global CSS).
    #root: ShadowRoot | HTMLElement;
    #usesShadow = true;
    // `@Component.compile()`: a static template is rendered once, then the
    // instance is frozen — `requestUpdate()` becomes a no-op (nothing in a
    // hole-free template can change), skipping all re-render work.
    #frozen = false;
    // True between an `onError` boundary firing and the next SUCCESSFUL render —
    // so if the fallback render throws too, the error escalates to the global
    // handler instead of re-invoking `onError` forever.
    #recovering = false;
    #parts?: Part[];
    #lastStrings?: TemplateStringsArray;
    #connected = false;
    #mounted = false;
    #disposed = false;
    #version = 0;
    #id = ++instanceCounter;
    #controller = new AbortController();
    #cleanups: Array<() => void> = [];
    /** `this.listen()` subscriptions, for the devtools listener listing. */
    #listenerLog: ListenerInfo[] = [];
    /** Per-instance scheduler override (runtime swap via devtools/setScheduler). */
    #schedulerOverride?: Scheduler;
    /** Active game-loop ticks -> their current unsubscribe, so a scheduler swap
     *  can move them onto the new scheduler's frame loop. */
    #frameStops = new Map<(dt: number) => void, () => void>();
    /** Props passed to `new View({...})`; applied in connectedCallback AFTER
     *  field initializers + @prop upgrade, so they win over defaults. */
    #pendingProps?: Record<string, unknown>;
    /** Slot content (light DOM) projected into a `<slot>` — for islands/SSR. */
    #pendingSlot?: SlotContent;

    /** Typed factory: `UserView.of({ user })` autocompletes/checks the props of
     *  THIS class (its `_typed_props` contract if it declares one, else its data
     *  fields). Polymorphic `this` works on a static method, unlike the
     *  constructor. Optional `slot` is projected into a `<slot>` (islands/SSR).
     *  Prefer it over `new View({…})` when you want type-safety. */
    static of<T extends Reactive>(
      this: new (...a: any[]) => T,
      props: PublicProps<T>,
      slot?: SlotContent,
    ): T {
      return new this(props as Record<string, unknown>, slot);
    }

    // `new View({ name: "Ada" })` — first arg, if an object, becomes the props
    // bag (applied on connect). Optional, so `createElement` / the parser (which
    // call `new View()`) still work. The `...args` shape is required for mixins.
    constructor(...args: any[]) {
      super();
      this.#usesShadow = (this.constructor as { shadow?: boolean }).shadow !== false;
      if (this.#usesShadow) {
        // Reuse a Declarative-Shadow-DOM root if the parser already created one
        // (SSR hydration); otherwise attach a fresh shadow root.
        this.#root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        // Scoped styles from this class and every base in the chain (e.g. a
        // `Highlighted` base). They live on the shadow root, not as children, so
        // re-renders don't touch them.
        (this.#root as ShadowRoot).adoptedStyleSheets = getStyles(this.constructor);
      } else {
        // Light-DOM mode: render straight into the element. No attachShadow (the
        // biggest single mount cost), so this is markedly faster — at the price
        // of style scoping and `<slot>` projection. Styles fall back to global CSS.
        this.#root = this;
      }
      devtoolsIds.set(this, this.#id); // for the inspector's parent lookup
      const props = args[0];
      if (props && typeof props === "object") {
        this.#pendingProps = props as Record<string, unknown>;
        hydrationData.set(this, this.#pendingProps); // for SSR -> client hydration
      }
      const slot = args[1];
      if (slot != null) this.#pendingSlot = slot as SlotContent;
    }

    get version(): number {
      return this.#version;
    }

    /** Aborted on disconnect — pass to `addEventListener` / `fetch` / `this.task`'s
     *  `{ signal }`. (Named `abortSignal` so `this.signal()` is free for reactive
     *  state — Preact/Angular signals.) */
    get abortSignal(): AbortSignal {
      return this.#controller.signal;
    }

    /**
     * A reactive value bound to this component — the signals model from
     * Preact/Angular. Writing it schedules a re-render, like a `@prop`, but it's
     * value-typed and lives in a field (no decorator, no attribute):
     *
     *   class Counter extends Component("x-counter") {
     *     count = this.signal(0);
     *     render() {
     *       return html`<button @click=${() => this.count.update(n => n + 1)}>
     *         ${this.count()}
     *       </button>`;
     *     }
     *   }
     *
     * Read with `this.count()` (Angular) or `this.count.value` (Preact); write
     * with `.set(x)`, `.value = x`, or `.update(prev => …)`. Auto-disposed on
     * disconnect.
     */
    signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
      const sig = createSignal(initial, options);
      // Bridge to the host's version-based scheduler: re-render whenever the
      // signal changes. The effect runs once now to subscribe — skip that first
      // tick so a field initializer doesn't request an update before connect.
      let primed = false;
      const stop = createEffect(() => {
        sig.value; // read → subscribe
        if (primed) this.requestUpdate();
        else primed = true;
      });
      this.#cleanups.push(stop);
      return sig;
    }

    /** Memoized derived signal scoped to this host — recomputes lazily when the
     *  signals it reads change. */
    computed<T>(compute: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
      return createComputed(compute, options);
    }

    /**
     * Run `fn` now and re-run it whenever the signals it reads change — for side
     * effects (logging, imperative DOM, syncing to storage). `fn` may return a
     * cleanup that runs before each re-run and on disconnect. Auto-stopped on
     * disconnect; the returned disposer stops it early.
     */
    effect(fn: () => void | (() => void)): () => void {
      const stop = createEffect(fn);
      this.#cleanups.push(stop);
      return stop;
    }

    get #scheduler(): Scheduler {
      return (
        this.#schedulerOverride ??
        (this.constructor as { scheduler?: Scheduler }).scheduler ??
        getDefaultScheduler()
      );
    }

    /**
     * Swap this instance's scheduler at runtime (devtools / debugging). Pass
     * `undefined` to revert to the class's `static scheduler` / global default.
     * Re-renders via the new scheduler so the change takes effect immediately.
     */
    setScheduler(scheduler?: Scheduler): void {
      this.#schedulerOverride = scheduler;
      // Move any running game-loop ticks (onFrame) onto the new scheduler —
      // otherwise the loop keeps running at the OLD scheduler's cadence.
      for (const callback of [...this.#frameStops.keys()]) {
        this.#frameStops.get(callback)?.(); // stop on the old scheduler
        this.#subscribeFrame(callback); // restart on the new one
      }
      this.requestUpdate(); // re-render through the new scheduler + refresh devtools
    }

    /** DOM depth (crosses shadow boundaries) — parents flush before children. */
    get depth(): number {
      let depth = 0;
      let node: Node | null = this;
      while (node) {
        depth++;
        node = node.parentNode ?? (node as { host?: Node }).host ?? null;
      }
      return depth;
    }

    // ---- devtools ----
    #tag(): string {
      return (this.constructor as { tagName?: string }).tagName ?? "?";
    }
    #snapshot(): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      for (const name of getReactiveProps(this.constructor)) {
        out[name] = (this as Record<string, unknown>)[name];
      }
      return out;
    }
    // Each scoped rule + whether its selector currently matches anything in the
    // shadow root (applied) or not (dead CSS).
    #styleRules(): StyleRule[] {
      if (!this.#usesShadow) return []; // light DOM has no adoptedStyleSheets
      const out: StyleRule[] = [];
      for (const sheet of (this.#root as ShadowRoot).adoptedStyleSheets) {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule) {
            out.push({
              selector: rule.selectorText,
              cssText: rule.cssText,
              applied: this.#selectorApplies(rule.selectorText),
            });
          } else {
            // at-rules (@media, @keyframes, …): keep, mark applied
            out.push({ selector: "", cssText: rule.cssText, applied: true });
          }
        }
      }
      return out;
    }

    // Does any comma-group of `selector` match the host or a shadow descendant?
    #selectorApplies(selector: string): boolean {
      for (const raw of selector.split(",")) {
        const group = raw.trim();
        try {
          if (group === ":host") return true;
          const host = group.match(/^:host\((.+)\)$/);
          if (host) {
            if (this.matches(host[1])) return true;
            continue;
          }
          // descendant of host (`:host .x`) -> match the inner part in the tree
          const inner = group.startsWith(":host ") ? group.slice(6) : group;
          if (this.#root.querySelector(inner.replace(/::[\w-]+$/, "")))
            return true;
        } catch {
          return true; // unknown/complex selector -> don't claim it's dead
        }
      }
      return false;
    }
    /** Nearest ancestor component's id, climbing parents + shadow hosts. */
    #parentId(): number | undefined {
      let node: Node | null =
        this.parentNode ?? (this as { host?: Node }).host ?? null;
      while (node) {
        const id = devtoolsIds.get(node);
        if (id !== undefined) return id;
        node = node.parentNode ?? (node as { host?: Node }).host ?? null;
      }
      return undefined;
    }
    /** Active listeners: explicit `listen()` calls + template `@event` bindings. */
    #collectListeners(): ListenerInfo[] {
      const template = (this.#parts ?? [])
        .filter((p): p is EventPart => p instanceof EventPart)
        .map((p) => ({
          type: p.name,
          target: describeTarget(p.el),
          source: "template" as const,
        }));
      return [...this.#listenerLog, ...template];
    }
    #devtools(kind: DevtoolsEvent["kind"], emit?: DevtoolsEvent["emit"]): void {
      const hook = devtoolsHook();
      if (!hook) return;
      // Opt-out: a component can set `static devtools = false` to stay out of the
      // inspector — used by the devtools' OWN UI (built with this framework) so it
      // doesn't recursively report itself into the component tree.
      if ((this.constructor as { devtools?: boolean }).devtools === false) return;
      const mounting = kind === "mount";
      const lifecycle = mounting || kind === "update";
      hook.send({
        kind,
        id: this.#id,
        tag: this.#tag(),
        time: Date.now(),
        version: this.#version,
        props: this.#snapshot(),
        // Captured every lifecycle tick (not just mount) so time-travel can
        // restore styles, e.g. ones changed imperatively via setStyles().
        styles: lifecycle ? this.#styleRules() : undefined,
        emit,
        parentId: mounting ? this.#parentId() : undefined,
        el: mounting ? this : undefined,
        exposed: mounting ? getExposedEvents(this.constructor) : undefined,
        listeners: lifecycle ? this.#collectListeners() : undefined,
        scheduler: lifecycle ? (this.#scheduler.name ?? "?") : undefined,
        schedulerRef: lifecycle ? this.#scheduler : undefined,
        priority: lifecycle
          ? ((this.constructor as { priority?: Priority }).priority ??
            "render-blocking")
          : undefined,
      });
    }

    connectedCallback(): void {
      // Fresh lifecycle on (re)connect.
      if (this.#disposed || this.#controller.signal.aborted) {
        this.#controller = new AbortController();
        this.#disposed = false;
      }
      if (!this.#connected) {
        this.#connected = true;
        for (const name of getReactiveProps(this.constructor)) {
          this.#upgradeProp(name);
        }
        // Reflect attribute-mapped props from the element's current attributes.
        // Done here (not only via attributeChangedCallback) so an UPGRADE of an
        // existing element — i.e. SSR hydration — reliably picks them up.
        const attrs = attrPropMap(this.constructor);
        if (attrs)
          for (const attr in attrs)
            if (this.hasAttribute(attr)) this.#reflectAttr(attrs[attr], this.getAttribute(attr));
        // Apply constructor props now — after field initializers + @prop upgrade
        // — so `new View({ name })` wins over `@prop() name = default`.
        if (this.#pendingProps) {
          Object.assign(this, this.#pendingProps);
          this.#pendingProps = undefined;
        }
        // Project slot content into the LIGHT DOM. Skip if light children already
        // exist (SSR/hydration already placed them) — avoids duplicating them.
        if (this.#pendingSlot != null && this.childNodes.length === 0) {
          appendSlot(this, this.#pendingSlot);
        }
        this.#pendingSlot = undefined;
        // Reflect `reflect: true` props to their attributes now (after the props
        // are settled), so `:host([attr])` matches on the first render.
        const reflects = reflectPropMap(this.constructor);
        if (reflects)
          for (const prop in reflects)
            this.#writeAttr(reflects[prop], (this as Record<string, unknown>)[prop]);
        this.#loadLazyStyles(); // resolve `() => import('./x.css')` styles, adopt when ready
      }
      this.#render();
    }

    /** Resolve any lazy style thunks and adopt the sheets once they load. The
     *  component has already rendered with its synchronous styles by now, so
     *  these arrive late (FOUC) — see `ComponentOptions.styles`. */
    #loadLazyStyles(): void {
      if (!this.#usesShadow) return; // no adoptedStyleSheets target in light DOM
      const root = this.#root as ShadowRoot;
      for (const thunk of getLazyStyles(this.constructor)) {
        loadLazySheet(thunk)
          .then((sheet) => {
            if (this.#disposed || this.#controller.signal.aborted) return;
            if (!root.adoptedStyleSheets.includes(sheet))
              root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
          })
          .catch((e) => console.error(`[${this.#tag()}] lazy styles failed:`, e));
      }
    }

    /** Light-DOM children projected into this component's `<slot>` — for render
     *  logic (fallbacks, counts, wrapping). The `<slot>` element projects them
     *  automatically; use this only when you need to branch on the content. */
    slotted(): Element[] {
      return [...this.children];
    }

    /**
     * Typed attribute read: the component's `@prop` names autocomplete (other
     * strings still allowed via the AnyString trick). The return type stays
     * `string | null` — attributes ARE strings, and overriding `Element`'s
     * signature can't widen the return without breaking the base contract. For a
     * typed VALUE, read the prop directly (`this.count`) or use `attr()`.
     */
    override getAttribute<S extends PropNames<this> | AnyString>(qualifiedName: S): string | null {
      return super.getAttribute(qualifiedName);
    }

    /** Like getAttribute, but typed to the prop: a known `@prop` name returns
     *  that prop's value (read off the instance), otherwise the raw attribute. */
    attr<S extends PropNames<this> | AnyString>(
      name: S,
    ): (S extends keyof this ? this[S] : never) | string | null {
      return (
        name in this
          ? (this as Record<string, unknown>)[name as string]
          : super.getAttribute(name)
      ) as never;
    }

    disconnectedCallback(): void {
      try {
        (this as Partial<OnUnmount>).onUnmount?.();
      } catch (error) {
        this.#handleError(error, "unmount");
      }
      this[Symbol.dispose](); // teardown always runs, even if onUnmount threw
    }

    /** Explicit disposal (TC39 `using`) — same teardown as disconnect. */
    [Symbol.dispose](): void {
      if (this.#disposed) return;
      this.#devtools("unmount");
      this.#disposed = true;
      for (const teardown of this.#cleanups.splice(0)) teardown();
      this.#controller.abort(); // auto-removes listeners registered with this.abortSignal
    }

    requestUpdate(
      priority: Priority = (this.constructor as { priority?: Priority })
        .priority ?? "render-blocking",
    ): void {
      // A compiled, static template never changes after its first render — drop
      // the update entirely (no version bump, no schedule, no re-render).
      if (this.#frozen) return;
      this.#version++; // bump first so @computed invalidates even if a render is queued
      if (!this.#connected) return;
      // The scheduler dedupes/escalates/orders; no per-host guard needed.
      this.#scheduler.request(this, priority);
    }

    /** Render now — called by the scheduler (implements SchedulerHost). */
    flush(): void {
      this.#render();
    }

    /** Flush this host's scheduler synchronously (SSR/SSG, tests). */
    flushSync(): void {
      this.#scheduler.flushSync();
    }

    /** Register teardown to run on disconnect / dispose. */
    onCleanup(teardown: () => void): void {
      this.#cleanups.push(teardown);
    }

    /**
     * Create an abortable async task bound to this host — sugar for the
     * standalone `task(this, …)`, so you don't have to pass `this`:
     *
     *   load = this.task(async (id, signal) => fetch(`/x/${id}`, { signal }), { priority: "background" });
     *
     * The previous run is aborted when a new one starts and on disconnect; its
     * `pending` / `value` / `error` updates are scheduled at `options.priority`.
     */
    task<A extends unknown[], R>(
      fn: (...args: [...A, AbortSignal]) => Promise<R>,
      options?: TaskOptions,
    ): Task<A, R> {
      return task(this, fn, options);
    }

    /** This instance's live scoped stylesheets. Mutate one in place
     *  (`getStyles()[0].replaceSync(…)`) to restyle at runtime — note `css`
     *  sheets shared across components are shared state. Prefer `setStyles()`
     *  for a clean per-instance swap. */
    getStyles(): CSSStyleSheet[] {
      return this.#usesShadow ? [...(this.#root as ShadowRoot).adoptedStyleSheets] : [];
    }

    /** Replace this instance's scoped styles at runtime (per-instance — does
     *  not touch sheets shared via `static styles` / Component options).
     *  No-op in light-DOM mode (no scoping target). */
    setStyles(input: StyleInput | StyleInput[]): void {
      if (this.#usesShadow) (this.#root as ShadowRoot).adoptedStyleSheets = toStyleSheets(input);
    }

    /**
     * Game-loop tick (dt in ms) on this host's scheduler — runs every frame,
     * even with no reactive change; state set inside renders the same frame.
     * Auto-stops on disconnect. Use a frame scheduler (`static scheduler =
     * createFpsScheduler(n)`); otherwise falls back to the rAF scheduler.
     */
    onFrame(callback: (dt: number) => void): () => void {
      this.#subscribeFrame(callback);
      const teardown = () => {
        this.#frameStops.get(callback)?.(); // unsubscribe from the current scheduler
        this.#frameStops.delete(callback);
      };
      this.onCleanup(teardown);
      return teardown;
    }

    /** (Re)subscribe a game-loop tick on the CURRENT scheduler, tracking its
     *  unsubscribe so a later scheduler swap can move it. */
    #subscribeFrame(callback: (dt: number) => void): void {
      const sched = this.#scheduler;
      const stop = (sched.frame ?? rafScheduler.frame!)(callback);
      this.#frameStops.set(callback, stop);
    }

    /** addEventListener that auto-unsubscribes on disconnect. */
    listen<T extends EventTarget>(
      target: T,
      type: string,
      handler: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ): void {
      target.addEventListener(type, handler, options);
      const info: ListenerInfo = {
        type,
        target: describeTarget(target),
        source: "listen",
      };
      this.#listenerLog.push(info);
      this.onCleanup(() => {
        target.removeEventListener(type, handler, options);
        const i = this.#listenerLog.indexOf(info);
        if (i >= 0) this.#listenerLog.splice(i, 1);
      });
    }

    /** Dispatch a CustomEvent (Angular @Output / Vue emit). Bubbling + composed
     *  by default so a parent's `@type=${fn}` (even across a shadow boundary)
     *  catches it; `flags` overrides those for one dispatch. */
    emit<T = unknown>(
      type: string,
      detail?: T,
      flags?: { bubbles?: boolean; composed?: boolean; cancelable?: boolean },
    ): void {
      this.#devtools("emit", { type, detail });
      this.dispatchEvent(
        new CustomEvent<T>(type, {
          detail,
          bubbles: flags?.bubbles ?? true,
          composed: flags?.composed ?? true,
          cancelable: flags?.cancelable ?? false,
        }),
      );
    }

    #upgradeProp(name: string): void {
      let store = (this as Record<string, unknown>)[name];
      // A value bound before this element upgraded (cloned fragment) wins over
      // the `@prop x = default` field initializer that just clobbered it.
      const external = externalProps.get(this);
      if (external?.has(name)) {
        store = external.get(name);
        external.delete(name);
      }
      delete (this as Record<string, unknown>)[name];
      const watchers = getWatchers(this.constructor, name);
      const reflectAttr = reflectPropMap(this.constructor)?.[name];
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        get: () => store,
        set: (value: unknown) => {
          if (value === store) return;
          const previous = store;
          store = value;
          for (const m of watchers) {
            (
              this as unknown as Record<
                string,
                (n: unknown, p: unknown) => void
              >
            )[m](value, previous);
          }
          // Reflect to the attribute (the echoed attributeChangedCallback sets the
          // same value, so the setter's `value === store` guard stops any loop).
          if (reflectAttr !== undefined) this.#writeAttr(reflectAttr, value);
          this.requestUpdate();
        },
      });
    }

    /** Write a prop value to an attribute: booleans toggle presence, others stringify. */
    #writeAttr(attr: string, value: unknown): void {
      if (value === false || value == null) this.removeAttribute(attr);
      else this.setAttribute(attr, value === true ? "" : String(value));
    }

    #render(): void {
      const prevHost = getCurrentHost();
      setCurrentHost(this); // so portal/ref directives can tie cleanup to this host
      try {
        this.#renderInner();
      } finally {
        setCurrentHost(prevHost);
      }
    }

    /** Route a caught error to this component's `onError` boundary (once per
     *  failed render cycle), else to the global handler. */
    #handleError(error: unknown, phase: ErrorPhase): void {
      const info: ErrorInfo = { phase, tag: this.#tag(), component: this };
      const onError = (this as Partial<OnError>).onError;
      if (typeof onError === "function" && !this.#recovering) {
        this.#recovering = true; // reset by the next successful render (loop guard)
        try {
          onError.call(this, error, info);
          return;
        } catch (e) {
          error = e; // the boundary itself threw → escalate
        }
      }
      errorHandler(error, info);
    }

    #renderInner(): void {
      const firstRender = !this.#mounted;
      // A throw in render()/commit is contained here: the component's onError
      // boundary (or the global handler) deals with it and the scheduler batch
      // carries on for every other component.
      try {
        const result = this.render();
        if (result instanceof Node) {
          // render() delegated to another component instance (`return Child.of({…})`).
          // Mount it as the sole shadow child; replace only if it actually changed.
          if (
            this.#root.childNodes.length !== 1 ||
            this.#root.firstChild !== result
          ) {
            while (this.#root.firstChild)
              this.#root.removeChild(this.#root.firstChild);
            this.#root.appendChild(result);
          }
          this.#lastStrings = undefined;
          this.#parts = undefined;
        } else if (this.#lastStrings !== result.strings) {
          const { content, metas } = compileTemplate(result.strings);
          const frag = content.cloneNode(true) as DocumentFragment;
          this.#parts = bindParts(frag, metas);
          this.#lastStrings = result.strings;
          for (const part of this.#parts)
            part.commit(result.values[part.holeIndex]);
          while (this.#root.firstChild)
            this.#root.removeChild(this.#root.firstChild);
          this.#root.appendChild(frag);
        } else {
          for (const part of this.#parts!) {
            part.commit(result.values[part.holeIndex]);
          }
        }

        // `@Component.compile()` + a hole-free template → the output is fixed.
        // Freeze the instance so future requestUpdate()s are dropped (see above).
        if (
          !this.#frozen &&
          !(result instanceof Node) &&
          result.values.length === 0 &&
          rendersCompiled(this.constructor)
        ) {
          this.#frozen = true;
        }
      } catch (error) {
        this.#handleError(error, firstRender ? "render" : "update");
        return; // leave the DOM as-is; the boundary/handler took over
      }
      this.#recovering = false; // a render succeeded → leave recovery mode

      // Lifecycle hooks are caught too — a throwing onMount/onUpdate is reported,
      // but mount state is already committed so the component stays consistent.
      try {
        if (firstRender) {
          this.#mounted = true;
          (this as Partial<OnMount>).onMount?.();
          this.#devtools("mount");
        } else {
          (this as Partial<OnUpdate>).onUpdate?.();
          this.#devtools("update");
        }
      } catch (error) {
        if (firstRender) this.#mounted = true; // ensure mounted even if onMount threw
        this.#handleError(error, firstRender ? "mount" : "update");
      }
    }

    // Usually an html`` template; may also be another component instance
    // (`return Child.of({…})`) to delegate rendering entirely to it.
    abstract render(): TemplateResult | Node;

    // Lifecycle hooks are NOT declared here on purpose: a subclass opts in by
    // defining onMount/onUpdate/onUnmount (Vue: onMounted/… · Angular: ngOnInit/…),
    // optionally with `implements OnMount` to have the compiler require it. They
    // run via duck-typing (`?.`) so a component without them costs nothing.
  }
  return Reactive;
}

// ============================================================
// Component factory + decorators
// ============================================================

type ComponentConstructor = (new () => HTMLElement) & { tagName: string };

/**
 * When `@Component.define(when)` should register the element on the client:
 *   - (omitted)          — immediately (same as the bare `@Component.define`).
 *   - "domcontentloaded" — on DOMContentLoaded (or now if already past it).
 *   - "load"             — on window `load`.
 *   - "idle"             — in `requestIdleCallback`.
 *   - number             — after N milliseconds.
 *   - () => Promise|void  — when the returned promise settles.
 *   - "server"           — SSR only: never registers on the client (stays static).
 * SSR is unaffected: renderToString() flushes all of these synchronously first.
 */
type DefineWhen =
  | "domcontentloaded"
  | "load"
  | "idle"
  | "server"
  | number
  | (() => Promise<unknown> | void);

/**
 * A composable, orthogonal extension for a component — the DOM analogue of a
 * server `Controller`'s `guards` / `interceptors`. Each provider in
 * `Component(tag, { providers: [...] })` is installed once per instance (after
 * the reactive base is ready) and may both augment `this` (the members it
 * declares in `Contributes`) and register teardown via `host.onCleanup`.
 *
 * `Contributes` is a phantom carried only at the type level: the factory unions
 * every provider's contribution into the component's instance type, so the
 * members a provider installs (e.g. `this.i18n`) are typed — and autocompleted —
 * inside the class. Providers are independent: their contributions don't overlap.
 *
 *   const i18nProvider = (t: Translator<…>): ComponentProvider<{ i18n: typeof t }> => ({
 *     install(host) { (host as any).i18n = t; localized(host, t); },
 *   });
 *   class Card extends Component("x-card", { providers: [i18nProvider(appI18n)] }) {
 *     render() { return html`${this.i18n("hello")}`; } // typed + autocompleted
 *   }
 */
export interface ComponentProvider<Contributes = {}> {
  /** Install this provider onto a fresh instance (called from the constructor,
   *  after the reactive base is set up). Augment `host` and/or `host.onCleanup`. */
  install(host: ReactiveHost & HTMLElement): void;
  /** Phantom: the instance members this provider adds. Never read at runtime. */
  readonly __contributes?: Contributes;
}

// Fold a union of provider contributions into a single intersection.
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;
type ContribOf<P> = P extends ComponentProvider<infer C> ? C : {};
/** The intersection of every provider's contribution (`{}` when there are none). */
type ProviderContributions<P extends readonly ComponentProvider[]> = P extends readonly []
  ? {}
  : UnionToIntersection<ContribOf<P[number]>>;

/** Options for a component, set once at the `Component()` call site instead of
 *  as `static` fields. A subclass's own `static priority` / `static scheduler`
 *  still wins if it also declares them. */
interface ComponentOptions<
  TBase extends Constructor<HTMLElement> = typeof HTMLElement,
  TProviders extends readonly ComponentProvider[] = readonly ComponentProvider[],
> {
  /** Base class to extend (Angular-style inheritance); defaults to HTMLElement.
   *  Its members are inherited and `TBase` is inferred from it. */
  base?: TBase;
  /** Composable extensions installed per instance; each may add typed members to
   *  `this` (unioned into the instance type) and register cleanup. Orthogonal —
   *  like a `Controller`'s `guards` / `interceptors`. */
  providers?: TProviders;
  /** Default update priority for this component's re-renders. */
  priority?: Priority;
  /** Per-component scheduler; falls back to the global default when omitted. */
  scheduler?: Scheduler;
  /**
   * Scoped styles: a `css` sheet, raw CSS text (e.g. an imported `.css` file),
   * or a list of either. Equivalent to declaring `static styles`.
   *
   * A `() => import("./x.css")` thunk (or any promise-returning thunk) is also
   * accepted for LAZY loading — but this is **not the preferred path**: the
   * component renders before the stylesheet resolves, so there's a flash of
   * unstyled content, the import must yield CSS *text* (configure your bundler:
   * esbuild `loader: { ".css": "text" }`, Vite `?inline`), and it does nothing
   * during SSR. Prefer a synchronous `css`/imported-text stylesheet when you can.
   */
  styles?: StyleInput | LazyStyle | Array<StyleInput | LazyStyle>;
  /**
   * Render into a Shadow DOM root (default `true`). Set `false` for **light-DOM
   * mode**: the component renders straight into the element, skipping
   * `attachShadow` — the single biggest mount cost — for a markedly faster
   * mount. The trade-off: no style scoping (`static styles` / `styles` are
   * ignored; use global CSS) and no `<slot>` projection. Use it for hot,
   * leaf-level components where scoping isn't needed.
   */
  shadow?: boolean;
}

// Auto-generated tag for `Component()` calls that omit one (e.g. a component used
// only via JSX / `.of` / the React adapter, never written as a literal tag).
let anonTagSeq = 0;

// The base class can be given via `options.base`, or positionally for brevity:
//   Component("x")                                  · HTMLElement base
//   Component("x", { base: Logger, priority })      · base + options in one object
//   Component("x", Logger)                          · positional base (shorthand)
//   Component("x", Logger, { priority })            · positional base + options
// The 2nd arg is disambiguated at runtime by `typeof === "function"` (a
// constructor) vs a plain options object. `TBase` is inferred from either form.
//
// `TProps` is the component's PUBLIC prop contract — the shape consumers pass via
// `.of({…})`, `new X({…})`, JSX, or the React adapter, and that types `this.*`
// inside the class for autocomplete:
//
//   type Props = { enabled: boolean };
//   class Toggle extends Component<Props>("x-toggle") {
//     @Component.prop() enabled = false;            // declare → reactive + typed
//     render() { return html`${this.enabled}`; }    // this.enabled: boolean
//   }
//   Toggle.of({ enabled: true });                   // ← prop autocomplete/checks
//
// Add `implements Props` to also get a COMPILE error if a contract prop is left
// undeclared ("Property 'enabled' is missing") — TS can't force that through
// `extends` alone (an inherited member satisfies it), so `implements` is the
// idiomatic opt-in guard.
//
// You can also anchor the contract ON the instance with a TS-only phantom field:
//
//   class Toggle extends Component<Props>() {
//     declare _typed_props: Props;   // erased at runtime; the public contract
//     @Component.prop() enabled = false;
//   }
//
// `.of()`, `PropsOf<typeof Toggle>`, the React adapter and JSX then read
// `_typed_props` as the curated public props (instead of every data field).
function Component<
  TProps = {},
  TBase extends Constructor<HTMLElement> = typeof HTMLElement,
  const TProviders extends readonly ComponentProvider[] = readonly [],
>(
  tagName?: string,
  baseOrOptions?: TBase | ComponentOptions<TBase, TProviders>,
  options?: ComponentOptions<TBase, TProviders>,
) {
  const positionalBase = typeof baseOrOptions === "function";
  const opts =
    (positionalBase ? options : (baseOrOptions as ComponentOptions<TBase, TProviders>)) ??
    {};
  const Base = (
    positionalBase ? baseOrOptions : (opts.base ?? HTMLElement)
  ) as TBase;
  const providers = opts.providers;
  abstract class Scoped extends reactive(Base) {
    static override tagName = tagName ?? `youneed-c${++anonTagSeq}`;
    constructor(...args: any[]) {
      super(...args);
      // Install composable providers once per instance, after the reactive base
      // is ready (so `host.onCleanup` / `requestUpdate` exist). Orthogonal — the
      // server-`Controller` `guards`/`interceptors` pattern, for components.
      if (providers) for (const p of providers) p.install(this as never);
    }
  }
  if (opts.priority !== undefined) Scoped.priority = opts.priority;
  if (opts.scheduler !== undefined) Scoped.scheduler = opts.scheduler;
  if (opts.shadow !== undefined) Scoped.shadow = opts.shadow;
  if (opts.styles !== undefined) {
    // Strings → sheets; CSSStyleSheets kept; lazy thunks kept for per-instance
    // async resolution (getStyles takes the sheets, getLazyStyles the thunks).
    (Scoped as { styles?: StyleEntry[] }).styles = normalizeStyles(opts.styles);
  }
  // Type the PUBLIC prop contract onto the typed factory `.of(props)` (adds a
  // TProps overload alongside the polymorphic one — so consumers autocomplete
  // TProps). We deliberately DON'T add TProps to the instance type or the
  // constructor: instance members would trip `noImplicitOverride` on every
  // `@prop` and stop `implements TProps` from forcing declaration, and a second
  // construct signature breaks `extends` (TS2510). Declared props stay plain
  // fields; `implements TProps` (opt-in) is what compile-checks them.
  // `typeof Scoped` is preserved verbatim (statics + the `() => Scoped` construct
  // signature), so the no-providers case is unchanged. The extra abstract
  // construct signature folds each provider's contribution into the INSTANCE type
  // — so `extends Component(tag, { providers })` gives a typed `this.<member>`
  // (e.g. `this.i18n`). With no providers the contribution is `{}` (a no-op).
  return Scoped as typeof Scoped &
    (abstract new (...args: any[]) => ProviderContributions<TProviders>) & {
      of(props: TProps, slot?: SlotContent): Scoped & ProviderContributions<TProviders>;
    };
}

// Attach the decorators (defined in ./decorators.ts) onto the Component factory.
Component.prop = propDecorator;
Component.event = eventDecorator;
Component.watch = watchDecorator;
Component.define = defineDecorator;
Component.compile = compileDecorator;
Component.computed = computedDecorator;

interface MountHandle {
  root: Element;
  element: HTMLElement;
  /** Unmount on scope exit (TC39 `using`) — removal disposes the component. */
  [Symbol.dispose](): void;
}

function Mount(root: Element | null, Root: ComponentConstructor): MountHandle {
  if (!root) throw new Error("Mount: root element not found");
  if (!Root.tagName) throw new Error("Mount: component has no tag name");
  define(Root);
  const element = document.createElement(Root.tagName);
  root.appendChild(element);
  return {
    root,
    element,
    [Symbol.dispose]() {
      element.remove(); // disconnectedCallback -> component [Symbol.dispose]
    },
  };
}

export { Component, Mount, hydrate, getHydrationProps, flushSync };
export type {
  ReactiveHost,
  DevtoolsEvent,
  DevtoolsHook,
  ListenerInfo,
  StyleRule,
  ComponentConstructor,
  ComponentOptions,
  DefineWhen,
  OnMount,
  OnUpdate,
  OnUnmount,
  OnError,
  MountHandle,
};
