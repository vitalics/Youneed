// decorators.ts — @Component.* decorators + their class-keyed registries, plus
// custom-element registration (define / scheduleDefine). Pure leaf: only depends
// on @youneed/core registries and (type-only) on component.ts for shared types.
import { createRegistry, classChain, ctorOf } from "@youneed/core";
import type { ReactiveHost, ComponentConstructor, DefineWhen } from "./component.ts";

// ============================================================
// Reactive property registry (filled by the @prop decorator)
// ============================================================

const reactiveProps = createRegistry<Set<string>>(() => new Set());

function registerProp(ctor: Function, name: string): void {
  reactiveProps.for(ctor).add(name);
}

// Reactive props are registered by decorators at class-definition time, so the
// flattened list is stable per class — resolve the chain walk once, then reuse
// it on every connect (it runs in connectedCallback for prop upgrades).
const reactivePropsCache = new WeakMap<Function, string[]>();

function getReactiveProps(ctor: Function): string[] {
  const cached = reactivePropsCache.get(ctor);
  if (cached) return cached;
  const out = new Set<string>();
  for (const c of classChain(ctor, HTMLElement)) {
    const set = reactiveProps.read(c);
    if (set) for (const n of set) out.add(n);
  }
  const arr = [...out];
  reactivePropsCache.set(ctor, arr);
  return arr;
}

// ── Exposed events (@Component.event("onAdd")) ─────────────────────────────────
// A component declares its public event surface with `@Component.event` on an
// EventEmitter field. Calling the emitter dispatches a bubbling/composed
// CustomEvent the parent binds with `@onAdd=${fn}`. The names are registered so
// devtools/tooling can introspect what a component emits.

/** A declared event emitter. Call it (or `.emit`) to fire the event. */
export interface EventEmitter<T = unknown> {
  (detail?: T): void;
  emit(detail?: T): void;
}

/** Options for `@Component.event(opts)`. */
export interface EventOptions {
  /** Event name (default: the decorated field/method name). */
  name?: string;
  /**
   * Part of the component's PUBLIC event surface — registered for
   * `getExposedEvents`, the devtools panel and editor completion. Defaults to
   * `true` for an emitter field. On a method, set it together with `name` to
   * declare an event you fire manually via `this.emit(name, …)`.
   */
  exposed?: boolean;
  /** CustomEvent flags for the emitter (defaults: bubbles + composed `true`). */
  bubbles?: boolean;
  composed?: boolean;
  cancelable?: boolean;
}

const exposedEvents = createRegistry<Set<string>>(() => new Set());

function registerEvent(ctor: Function, name: string): void {
  exposedEvents.for(ctor).add(name);
}

/** The event names a component (and its bases) exposes via `@Component.event`. */
function getExposedEvents(ctor: Function): string[] {
  const out = new Set<string>();
  for (const c of classChain(ctor, HTMLElement)) {
    const set = exposedEvents.read(c);
    if (set) for (const n of set) out.add(n);
  }
  return [...out];
}

/** Build an emitter bound to a host: `this.onAdd("payload")` or `this.onAdd.emit(...)`. */
type EmitFn = (type: string, detail?: unknown, flags?: { bubbles?: boolean; composed?: boolean; cancelable?: boolean }) => void;
function makeEmitter<T>(host: { emit: EmitFn }, type: string, opts: EventOptions): EventEmitter<T> {
  const flags = { bubbles: opts.bubbles, composed: opts.composed, cancelable: opts.cancelable };
  const fn = ((detail?: T) => host.emit(type, detail, flags)) as EventEmitter<T>;
  fn.emit = (detail?: T) => host.emit(type, detail, flags);
  return fn;
}

// `Symbol.dispose` isn't in the ES2022 lib — declare it (the runtime has it
// natively on modern Node/browsers; the ??= below is a defensive polyfill).
declare global {
  interface SymbolConstructor {
    readonly dispose: unique symbol;
    readonly metadata: unique symbol;
  }
}
(Symbol as { dispose?: symbol }).dispose ??= Symbol("Symbol.dispose");
// Decorator metadata target — `@Component.prop({ attribute })` writes the
// attribute↔prop map here at class-definition time, so `observedAttributes`
// (read by customElements.define) can see it before any instance exists.
(Symbol as { metadata?: symbol }).metadata ??= Symbol("Symbol.metadata");

/** metadata key holding `{ [attributeName]: propName }` for attribute→prop. */
const ATTR_META = "__attrProps__";
/** metadata key holding `{ [propName]: attributeName }` for `reflect` (prop→attribute). */
const REFLECT_META = "__reflectProps__";

type WithAttrMeta = {
  [Symbol.metadata]?: { [ATTR_META]?: Record<string, string>; [REFLECT_META]?: Record<string, string> };
};

/** Read the attribute→prop map off a class (or instance.constructor) metadata. */
function attrPropMap(target: unknown): Record<string, string> | undefined {
  return (target as WithAttrMeta)?.[Symbol.metadata]?.[ATTR_META];
}

/** Read the prop→attribute map (props declared with `reflect: true`). */
function reflectPropMap(target: unknown): Record<string, string> | undefined {
  return (target as WithAttrMeta)?.[Symbol.metadata]?.[REFLECT_META];
}



/** The constructor that matches a property's declared type — so
 *  `@prop({ type: Number })` is only valid on a `number` field (Lit-style).
 *  `[V]` tuples disable distribution over unions. */
type PropType<V> = [V] extends [number]
  ? NumberConstructor
  : [V] extends [string]
    ? StringConstructor
    : [V] extends [boolean]
      ? BooleanConstructor
      : [V] extends [readonly unknown[]]
        ? ArrayConstructor
        : [V] extends [object]
          ? ObjectConstructor
          : never;

const watchRegistry = createRegistry<Map<string, string[]>>(() => new Map());

function registerWatch(ctor: Function, prop: string, method: string): void {
  const map = watchRegistry.for(ctor);
  let list = map.get(prop);
  if (!list) map.set(prop, (list = []));
  list.push(method);
}

function getWatchers(ctor: Function, prop: string): string[] {
  const out: string[] = [];
  for (const c of classChain(ctor, HTMLElement)) {
    const list = watchRegistry.read(c)?.get(prop);
    if (list) out.push(...list);
  }
  return out;
}

// Classes whose render() carries `@Component.compile()` — opting into the
// compiled render path (a static template is built once, then the instance is
// frozen so re-renders are skipped entirely). Resolved once per class.
const compiledRenderCtors = new WeakSet<Function>();
const compiledRenderCache = new WeakMap<Function, boolean>();

function rendersCompiled(ctor: Function): boolean {
  const cached = compiledRenderCache.get(ctor);
  if (cached !== undefined) return cached;
  let compiled = false;
  for (const c of classChain(ctor, HTMLElement)) {
    if (compiledRenderCtors.has(c)) {
      compiled = true;
      break;
    }
  }
  compiledRenderCache.set(ctor, compiled);
  return compiled;
}

/**
 * Adds reactivity + Shadow-DOM rendering to any HTMLElement base, so a

/**
 * Reactive property: assigning to it schedules a re-render.
 *
 * `{ attribute }` reflects an HTML attribute INTO the prop, so any host
 * (plain HTML, React, Vue, SSR markup) can drive it by setting the attribute:
 *   @Component.prop({ attribute: true }) src = "";      // <x-el src="…">
 *   @Component.prop({ attribute: "max-count" }) max = 0; // <x-el max-count="…">
 * The string value is coerced to the prop's default type (number/boolean/string)
 * and kept in sync via observedAttributes + attributeChangedCallback.
 */
export function propDecorator<V = unknown>(opts?: {
  attribute?: boolean | string;
  /** Reflect the prop BACK to the attribute on change, so `:host([attr])` CSS
   *  and outside observers see it. Implies `attribute` (bidirectional). */
  reflect?: boolean;
  /** Lit-style type marker — must match the field's declared type (a `number`
   *  field takes `Number`, a `string` field `String`, …). Type-check only. */
  type?: PropType<V>;
}) {
  return function (_value: undefined, ctx: ClassFieldDecoratorContext<unknown, V>) {
    const name = ctx.name as string;
    // `reflect` implies an attribute. The attribute name is the option's string,
    // else the lowercased prop name.
    if (opts?.attribute || opts?.reflect) {
      const attr =
        typeof opts.attribute === "string" ? opts.attribute : name.toLowerCase();
      const meta = ctx.metadata as Record<string, Record<string, string>>;
      // Own copy (inheriting any parent class's map) so we never mutate a base.
      if (!Object.prototype.hasOwnProperty.call(meta, ATTR_META))
        meta[ATTR_META] = { ...(meta[ATTR_META] ?? {}) };
      meta[ATTR_META][attr] = name; // attribute → prop
      if (opts.reflect) {
        if (!Object.prototype.hasOwnProperty.call(meta, REFLECT_META))
          meta[REFLECT_META] = { ...(meta[REFLECT_META] ?? {}) };
        meta[REFLECT_META][name] = attr; // prop → attribute
      }
    }
    ctx.addInitializer(function (this: unknown) {
      registerProp((this as object).constructor, name);
    });
  };
};

/**
 * Two shapes:
 *
 * 1. On a FIELD — declare an EXPOSED event (Angular `@Output`). The field becomes
 *    an emitter; calling it fires a bubbling/composed CustomEvent the parent binds
 *    with `@name=${fn}`. The event name is the argument, else the field name:
 *      @Component.event("onAdd") add!: EventEmitter<string>;
 *      // child:  this.add("hello")  ·  this.add.emit("hello")
 *      // parent: <app-button @onAdd=${e => console.log(e.detail)}></app-button>
 *
 * 2. On a METHOD — auto-bind it to the instance so `@click=${this.onX}` keeps
 *    `this` (a plain handler, not an exposed event).
 */
export function eventDecorator(nameOrOpts?: string | EventOptions) {
  // Accept the shorthand string name, an options bag, or nothing.
  const opts: EventOptions = typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts ?? {});
  // Return type is `void` so this composes in a method-decorator position; the
  // field branch returns its initializer through a cast (TS field decorators
  // can't share a signature with method decorators, but the runtime is correct).
  return function (
    _value: unknown,
    ctx: ClassFieldDecoratorContext | ClassMethodDecoratorContext,
  ): void {
    if (ctx.kind === "field") {
      const type = opts.name ?? String(ctx.name);
      if (opts.exposed !== false) {
        ctx.addInitializer(function (this: unknown) {
          registerEvent((this as object).constructor, type);
        });
      }
      // Field initializer: the field's value becomes the host-bound emitter.
      return function (this: unknown) {
        return makeEmitter(this as { emit: EmitFn }, type, opts);
      } as unknown as void;
    }
    // Method: auto-bind. Expose only when explicitly asked (`{ exposed, name }`)
    // — declares an event the method fires manually via `this.emit(name, …)`.
    if (opts.exposed && opts.name) {
      const type = opts.name;
      ctx.addInitializer(function (this: unknown) {
        registerEvent((this as object).constructor, type);
      });
    }
    ctx.addInitializer(function (this: unknown) {
      const self = this as Record<string, (...a: unknown[]) => unknown>;
      const name = ctx.name as string;
      self[name] = self[name].bind(self);
    });
  };
};

/** Vue-style watcher: invoked with (next, prev) when `prop` changes. */
export function watchDecorator(prop: string) {
  return function (_value: unknown, ctx: ClassMethodDecoratorContext) {
    ctx.addInitializer(function (this: unknown) {
      registerWatch((this as object).constructor, prop, ctx.name as string);
    });
  };
};

/**
 * Class-decorator FACTORY: auto-register the element at declaration time (Lit's
 * `@customElement`). Always called with parentheses; an optional `when` defers
 * registration on the client (see `DefineWhen`).
 *
 *   @Component.define()        // register immediately
 *   @Component.define(3000)    // register 3s after load
 *   @Component.define("server")// SSR only; never registers on the client
 *   class RootComponent extends Component("app-root") { ... }
 *
 * Immediate registration: if matching elements are ALREADY in the DOM (e.g.
 * authored in static HTML), it is deferred to a microtask. A class decorator can
 * run before this class's own `static` field initializers (e.g.
 * `static scheduler = …`), and `customElements.define()` upgrades in-DOM
 * elements synchronously — which would run their lifecycle before those statics
 * exist. Deferring to a microtask lets the synchronous init finish first.
 */
function defineImmediate<T extends ComponentConstructor>(value: T): T {
  const inDom =
    typeof document !== "undefined" &&
    !!value.tagName &&
    hasUpgradeCandidate(value.tagName);
  if (inDom && typeof queueMicrotask === "function")
    queueMicrotask(() => define(value));
  else define(value);
  return value;
}

/** Is there an element of `tag` already in the DOM that `customElements.define`
 *  would upgrade synchronously? `getElementsByTagName` only sees the light DOM,
 *  but SSR'd component trees nest their children inside *shadow* roots — so a
 *  component used only inside another component (the norm) is invisible to it,
 *  its define runs synchronously, and its `static styles`/`scheduler`/etc. — set
 *  by field initializers that run AFTER the class decorator — aren't ready when
 *  the upgrade's constructor reads them. So pierce open shadow roots too. */
function hasUpgradeCandidate(tag: string): boolean {
  if (document.getElementsByTagName(tag).length > 0) return true;
  const stack: Array<Document | ShadowRoot> = [document];
  while (stack.length) {
    const root = stack.pop()!;
    const els = root.querySelectorAll("*");
    for (let i = 0; i < els.length; i++) {
      const sr = els[i].shadowRoot;
      if (!sr) continue;
      if (sr.querySelector(tag)) return true;
      stack.push(sr);
    }
  }
  return false;
}

// Deferred registrations (`@Component.define(when)`) wait for a browser trigger
// on the client; SSR can't wait, so renderToString() flushes them synchronously
// first (flushPendingDefines) and server markup always upgrades.
const pendingDefines = new Set<ComponentConstructor>();

/** Define every component still waiting on a trigger — used by SSR before render. */
export function flushPendingDefines(): void {
  for (const C of pendingDefines) define(C);
  pendingDefines.clear();
}

function scheduleDefine(value: ComponentConstructor, when: DefineWhen): void {
  pendingDefines.add(value); // the SSR flush picks this up regardless of the trigger
  // "server" = SSR-only: never registers on the client, so it stays static markup.
  // No window = non-DOM runtime; the flush will define it.
  if (when === "server" || typeof window === "undefined") return;
  const run = () => {
    pendingDefines.delete(value);
    defineImmediate(value);
  };
  if (typeof when === "number") setTimeout(run, when);
  else if (typeof when === "function") void Promise.resolve(when()).then(run);
  else if (when === "idle")
    (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1)))(
      run,
    );
  else if (when === "load")
    document.readyState === "complete"
      ? run()
      : window.addEventListener("load", run, { once: true });
  // "domcontentloaded"
  else if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run, { once: true });
}

export function defineDecorator(when?: DefineWhen) {
  return function <T extends ComponentConstructor>(
    value: T,
    ctx: ClassDecoratorContext,
  ): T {
    // Attach the decorator metadata to the class NOW. The engine assigns
    // `ctx.metadata` to `value[Symbol.metadata]` only AFTER every class decorator
    // returns — but `@Component.define()` IS a class decorator and registers the
    // element synchronously (customElements.define → reads observedAttributes,
    // which is derived from @prop({ attribute }) metadata). Without this, that
    // read sees nothing and attributeChangedCallback never fires for
    // attribute-mapped props. Member decorators have already populated
    // ctx.metadata by the time class decorators run, so this is the full map; the
    // engine's later assignment writes the SAME object, so it's idempotent.
    if (ctx.metadata && !Object.prototype.hasOwnProperty.call(value, Symbol.metadata)) {
      Object.defineProperty(value, Symbol.metadata, {
        value: ctx.metadata,
        configurable: true,
        writable: true,
      });
    }
    if (when === undefined) return defineImmediate(value);
    scheduleDefine(value, when);
    return value;
  };
};

/**
 * Opt `render()` into the compiled path. When the returned `html` template is
 * fully static (no `${}` interpolations), the component renders it once and then
 * FREEZES: subsequent `requestUpdate()` calls are dropped, so a static leaf
 * costs nothing to "re-render". (The runtime forerunner of a build-time template
 * compiler — see bench/compile-time.bench.ts.)
 *
 *   class Logo extends Component("app-logo") {
 *     @Component.compile()
 *     render() { return html`<div class="logo">▲ youneed</div>`; }
 *   }
 *
 * Applying it to a template WITH holes is harmless — it simply doesn't freeze
 * (a dynamic template still re-renders normally).
 */
export function compileDecorator() {
  return function (render: unknown, ctx: ClassMethodDecoratorContext) {
    if (ctx.name !== "render") {
      throw new Error("@Component.compile() must decorate the render() method");
    }
    ctx.addInitializer(function (this: unknown) {
      compiledRenderCtors.add(ctorOf(this));
    });
    return render as never;
  };
};

/** Vue-style computed: getter result is cached until the next reactive change. */
export function computedDecorator() {
  return function <T>(get: () => T, ctx: ClassGetterDecoratorContext): () => T {
    const name = ctx.name as string;
    return function (
      this: ReactiveHost & {
        __computed?: Map<string, { ver: number; value: T }>;
      },
    ): T {
      const cache = this.__computed ?? (this.__computed = new Map());
      const ver = this.version;
      const hit = cache.get(name);
      if (hit && hit.ver === ver) return hit.value;
      const value = get.call(this);
      cache.set(name, { ver, value });
      return value;
    };
  };
};


/** Register components so they upgrade when used as tags in templates. */
export function define(...components: ComponentConstructor[]): void {
  for (const C of components) {
    if (C.tagName && !customElements.get(C.tagName)) {
      customElements.define(
        C.tagName,
        C as unknown as CustomElementConstructor,
      );
    }
  }
}

export {
  getReactiveProps,
  getExposedEvents,
  attrPropMap,
  reflectPropMap,
  getWatchers,
  rendersCompiled,
};
