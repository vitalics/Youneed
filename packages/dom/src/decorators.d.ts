import type { ComponentConstructor, DefineWhen } from "./component.ts";
declare function getReactiveProps(ctor: Function): string[];
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
/** The event names a component (and its bases) exposes via `@Component.event`. */
declare function getExposedEvents(ctor: Function): string[];
declare global {
    interface SymbolConstructor {
        readonly dispose: unique symbol;
        readonly metadata: unique symbol;
    }
}
/** Read the attribute→prop map off a class (or instance.constructor) metadata. */
declare function attrPropMap(target: unknown): Record<string, string> | undefined;
/** Read the prop→attribute map (props declared with `reflect: true`). */
declare function reflectPropMap(target: unknown): Record<string, string> | undefined;
/** The constructor that matches a property's declared type — so
 *  `@prop({ type: Number })` is only valid on a `number` field (Lit-style).
 *  `[V]` tuples disable distribution over unions. */
type PropType<V> = [V] extends [number] ? NumberConstructor : [V] extends [string] ? StringConstructor : [V] extends [boolean] ? BooleanConstructor : [V] extends [readonly unknown[]] ? ArrayConstructor : [V] extends [object] ? ObjectConstructor : never;
declare function getWatchers(ctor: Function, prop: string): string[];
declare function rendersCompiled(ctor: Function): boolean;
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
export declare function propDecorator<V = unknown>(opts?: {
    attribute?: boolean | string;
    /** Reflect the prop BACK to the attribute on change, so `:host([attr])` CSS
     *  and outside observers see it. Implies `attribute` (bidirectional). */
    reflect?: boolean;
    /** Lit-style type marker — must match the field's declared type (a `number`
     *  field takes `Number`, a `string` field `String`, …). Type-check only. */
    type?: PropType<V>;
}): (_value: undefined, ctx: ClassFieldDecoratorContext<unknown, V>) => void;
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
export declare function eventDecorator(nameOrOpts?: string | EventOptions): (_value: unknown, ctx: ClassFieldDecoratorContext | ClassMethodDecoratorContext) => void;
/** Vue-style watcher: invoked with (next, prev) when `prop` changes. */
export declare function watchDecorator(prop: string): (_value: unknown, ctx: ClassMethodDecoratorContext) => void;
/** Define every component still waiting on a trigger — used by SSR before render. */
export declare function flushPendingDefines(): void;
export declare function defineDecorator(when?: DefineWhen): <T extends ComponentConstructor>(value: T, ctx: ClassDecoratorContext) => T;
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
export declare function compileDecorator(): (render: unknown, ctx: ClassMethodDecoratorContext) => never;
/** Vue-style computed: getter result is cached until the next reactive change. */
export declare function computedDecorator(): <T>(get: () => T, ctx: ClassGetterDecoratorContext) => () => T;
/** Register components so they upgrade when used as tags in templates. */
export declare function define(...components: ComponentConstructor[]): void;
export { getReactiveProps, getExposedEvents, attrPropMap, reflectPropMap, getWatchers, rendersCompiled, };
