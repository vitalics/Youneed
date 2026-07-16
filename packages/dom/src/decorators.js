// decorators.ts — @Component.* decorators + their class-keyed registries, plus
// custom-element registration (define / scheduleDefine). Pure leaf: only depends
// on @youneed/core registries and (type-only) on component.ts for shared types.
import { createRegistry, classChain, ctorOf } from "@youneed/core";
// ============================================================
// Reactive property registry (filled by the @prop decorator)
// ============================================================
const reactiveProps = createRegistry(() => new Set());
function registerProp(ctor, name) {
    reactiveProps.for(ctor).add(name);
}
// Reactive props are registered by decorators at class-definition time, so the
// flattened list is stable per class — resolve the chain walk once, then reuse
// it on every connect (it runs in connectedCallback for prop upgrades).
const reactivePropsCache = new WeakMap();
function getReactiveProps(ctor) {
    const cached = reactivePropsCache.get(ctor);
    if (cached)
        return cached;
    const out = new Set();
    for (const c of classChain(ctor, HTMLElement)) {
        const set = reactiveProps.read(c);
        if (set)
            for (const n of set)
                out.add(n);
    }
    const arr = [...out];
    reactivePropsCache.set(ctor, arr);
    return arr;
}
const exposedEvents = createRegistry(() => new Set());
function registerEvent(ctor, name) {
    exposedEvents.for(ctor).add(name);
}
/** The event names a component (and its bases) exposes via `@Component.event`. */
function getExposedEvents(ctor) {
    const out = new Set();
    for (const c of classChain(ctor, HTMLElement)) {
        const set = exposedEvents.read(c);
        if (set)
            for (const n of set)
                out.add(n);
    }
    return [...out];
}
function makeEmitter(host, type, opts) {
    const flags = { bubbles: opts.bubbles, composed: opts.composed, cancelable: opts.cancelable };
    const fn = ((detail) => host.emit(type, detail, flags));
    fn.emit = (detail) => host.emit(type, detail, flags);
    return fn;
}
Symbol.dispose ??= Symbol("Symbol.dispose");
// Decorator metadata target — `@Component.prop({ attribute })` writes the
// attribute↔prop map here at class-definition time, so `observedAttributes`
// (read by customElements.define) can see it before any instance exists.
Symbol.metadata ??= Symbol("Symbol.metadata");
/** metadata key holding `{ [attributeName]: propName }` for attribute→prop. */
const ATTR_META = "__attrProps__";
/** metadata key holding `{ [propName]: attributeName }` for `reflect` (prop→attribute). */
const REFLECT_META = "__reflectProps__";
/** Read the attribute→prop map off a class (or instance.constructor) metadata. */
function attrPropMap(target) {
    return target?.[Symbol.metadata]?.[ATTR_META];
}
/** Read the prop→attribute map (props declared with `reflect: true`). */
function reflectPropMap(target) {
    return target?.[Symbol.metadata]?.[REFLECT_META];
}
const watchRegistry = createRegistry(() => new Map());
function registerWatch(ctor, prop, method) {
    const map = watchRegistry.for(ctor);
    let list = map.get(prop);
    if (!list)
        map.set(prop, (list = []));
    list.push(method);
}
function getWatchers(ctor, prop) {
    const out = [];
    for (const c of classChain(ctor, HTMLElement)) {
        const list = watchRegistry.read(c)?.get(prop);
        if (list)
            out.push(...list);
    }
    return out;
}
// Classes whose render() carries `@Component.compile()` — opting into the
// compiled render path (a static template is built once, then the instance is
// frozen so re-renders are skipped entirely). Resolved once per class.
const compiledRenderCtors = new WeakSet();
const compiledRenderCache = new WeakMap();
function rendersCompiled(ctor) {
    const cached = compiledRenderCache.get(ctor);
    if (cached !== undefined)
        return cached;
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
export function propDecorator(opts) {
    return function (_value, ctx) {
        const name = ctx.name;
        // `reflect` implies an attribute. The attribute name is the option's string,
        // else the lowercased prop name.
        if (opts?.attribute || opts?.reflect) {
            const attr = typeof opts.attribute === "string" ? opts.attribute : name.toLowerCase();
            const meta = ctx.metadata;
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
        ctx.addInitializer(function () {
            registerProp(this.constructor, name);
        });
    };
}
;
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
export function eventDecorator(nameOrOpts) {
    // Accept the shorthand string name, an options bag, or nothing.
    const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts ?? {});
    // Return type is `void` so this composes in a method-decorator position; the
    // field branch returns its initializer through a cast (TS field decorators
    // can't share a signature with method decorators, but the runtime is correct).
    return function (_value, ctx) {
        if (ctx.kind === "field") {
            const type = opts.name ?? String(ctx.name);
            if (opts.exposed !== false) {
                ctx.addInitializer(function () {
                    registerEvent(this.constructor, type);
                });
            }
            // Field initializer: the field's value becomes the host-bound emitter.
            return function () {
                return makeEmitter(this, type, opts);
            };
        }
        // Method: auto-bind. Expose only when explicitly asked (`{ exposed, name }`)
        // — declares an event the method fires manually via `this.emit(name, …)`.
        if (opts.exposed && opts.name) {
            const type = opts.name;
            ctx.addInitializer(function () {
                registerEvent(this.constructor, type);
            });
        }
        ctx.addInitializer(function () {
            const self = this;
            const name = ctx.name;
            self[name] = self[name].bind(self);
        });
    };
}
;
/** Vue-style watcher: invoked with (next, prev) when `prop` changes. */
export function watchDecorator(prop) {
    return function (_value, ctx) {
        ctx.addInitializer(function () {
            registerWatch(this.constructor, prop, ctx.name);
        });
    };
}
;
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
function defineImmediate(value) {
    const inDom = typeof document !== "undefined" &&
        !!value.tagName &&
        hasUpgradeCandidate(value.tagName);
    if (inDom && typeof queueMicrotask === "function")
        queueMicrotask(() => define(value));
    else
        define(value);
    return value;
}
/** Is there an element of `tag` already in the DOM that `customElements.define`
 *  would upgrade synchronously? `getElementsByTagName` only sees the light DOM,
 *  but SSR'd component trees nest their children inside *shadow* roots — so a
 *  component used only inside another component (the norm) is invisible to it,
 *  its define runs synchronously, and its `static styles`/`scheduler`/etc. — set
 *  by field initializers that run AFTER the class decorator — aren't ready when
 *  the upgrade's constructor reads them. So pierce open shadow roots too. */
function hasUpgradeCandidate(tag) {
    if (document.getElementsByTagName(tag).length > 0)
        return true;
    const stack = [document];
    while (stack.length) {
        const root = stack.pop();
        const els = root.querySelectorAll("*");
        for (let i = 0; i < els.length; i++) {
            const sr = els[i].shadowRoot;
            if (!sr)
                continue;
            if (sr.querySelector(tag))
                return true;
            stack.push(sr);
        }
    }
    return false;
}
// Deferred registrations (`@Component.define(when)`) wait for a browser trigger
// on the client; SSR can't wait, so renderToString() flushes them synchronously
// first (flushPendingDefines) and server markup always upgrades.
const pendingDefines = new Set();
/** Define every component still waiting on a trigger — used by SSR before render. */
export function flushPendingDefines() {
    for (const C of pendingDefines)
        define(C);
    pendingDefines.clear();
}
function scheduleDefine(value, when) {
    pendingDefines.add(value); // the SSR flush picks this up regardless of the trigger
    // "server" = SSR-only: never registers on the client, so it stays static markup.
    // No window = non-DOM runtime; the flush will define it.
    if (when === "server" || typeof window === "undefined")
        return;
    const run = () => {
        pendingDefines.delete(value);
        defineImmediate(value);
    };
    if (typeof when === "number")
        setTimeout(run, when);
    else if (typeof when === "function")
        void Promise.resolve(when()).then(run);
    else if (when === "idle")
        (window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1)))(run);
    else if (when === "load")
        document.readyState === "complete"
            ? run()
            : window.addEventListener("load", run, { once: true });
    // "domcontentloaded"
    else if (document.readyState !== "loading")
        run();
    else
        document.addEventListener("DOMContentLoaded", run, { once: true });
}
export function defineDecorator(when) {
    return function (value, ctx) {
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
        if (when === undefined)
            return defineImmediate(value);
        scheduleDefine(value, when);
        return value;
    };
}
;
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
    return function (render, ctx) {
        if (ctx.name !== "render") {
            throw new Error("@Component.compile() must decorate the render() method");
        }
        ctx.addInitializer(function () {
            compiledRenderCtors.add(ctorOf(this));
        });
        return render;
    };
}
;
/** Vue-style computed: getter result is cached until the next reactive change. */
export function computedDecorator() {
    return function (get, ctx) {
        const name = ctx.name;
        return function () {
            const cache = this.__computed ?? (this.__computed = new Map());
            const ver = this.version;
            const hit = cache.get(name);
            if (hit && hit.ver === ver)
                return hit.value;
            const value = get.call(this);
            cache.set(name, { ver, value });
            return value;
        };
    };
}
;
/** Register components so they upgrade when used as tags in templates. */
export function define(...components) {
    for (const C of components) {
        if (C.tagName && !customElements.get(C.tagName)) {
            customElements.define(C.tagName, C);
        }
    }
}
export { getReactiveProps, getExposedEvents, attrPropMap, reflectPropMap, getWatchers, rendersCompiled, };
