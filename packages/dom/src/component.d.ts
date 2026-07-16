import { type Priority, type Scheduler } from "@youneed/dom-scheduler";
import type { Constructor } from "@youneed/core";
import type { TemplateResult, Part, SlotContent, StyleInput, LazyStyle } from "./template.ts";
import type { Signal, ReadonlySignal, SignalOptions } from "./signals.ts";
import type { Task, TaskOptions } from "./task.ts";
import { propDecorator, eventDecorator, watchDecorator, defineDecorator, compileDecorator, computedDecorator } from "./decorators.ts";
declare function flushSync(): void;
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
    emit?: {
        type: string;
        detail: unknown;
    };
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
/** Props an element was created with (for SSR serialization). */
declare function getHydrationProps(el: Element): Record<string, unknown> | undefined;
/**
 * Client-side hydration: read `<script type="application/json" data-hydrate>`
 * blocks ({ tag, props }) emitted during SSR and apply the props to matching
 * elements. Assigning a reactive @prop re-renders with the data — whether the
 * element is already upgraded or upgrades later. Call once on the client.
 */
declare function hydrate(root?: ParentNode): void;
/** Data-property subset of a component (methods excluded) — the shape accepted
 *  by `new View({...})`. Used with polymorphic `this` for per-subclass typing. */
type ComponentProps<T> = {
    [K in keyof T as T[K] extends Function ? never : K]?: T[K];
};
/** A component's PUBLIC prop shape. If the component declares a `_typed_props`
 *  contract anchor (`_typed_props!: Props` — a TS-only phantom, see Component()),
 *  that curated type is the contract; otherwise it's all the component's data
 *  fields. Used by `.of()` and {@link PropsOf}. */
type PublicProps<T> = T extends {
    _typed_props: infer P;
} ? P : ComponentProps<T>;
/** The public prop shape of a component CLASS — its `_typed_props` contract if it
 *  declares one, else its data fields. Handy for typing JSX intrinsic elements,
 *  the React adapter, or any consumer that hands the component props:
 *  `PropsOf<typeof Toggle>` → `{ enabled?, … }`. */
export type PropsOf<C extends {
    prototype: unknown;
}> = C extends {
    prototype: infer I;
} ? PublicProps<I> : never;
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
/** Install the global handler for component errors not handled by an `onError`
 *  hook (or thrown by one) — wire it to your logger/telemetry. Defaults to
 *  `console.error`. Returns the previous handler. */
export declare function setErrorHandler(handler: (error: unknown, info: ErrorInfo) => void): (error: unknown, info: ErrorInfo) => void;
type ComponentConstructor = (new () => HTMLElement) & {
    tagName: string;
};
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
type DefineWhen = "domcontentloaded" | "load" | "idle" | "server" | number | (() => Promise<unknown> | void);
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
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type ContribOf<P> = P extends ComponentProvider<infer C> ? C : {};
/** The intersection of every provider's contribution (`{}` when there are none). */
type ProviderContributions<P extends readonly ComponentProvider[]> = P extends readonly [] ? {} : UnionToIntersection<ContribOf<P[number]>>;
/** Options for a component, set once at the `Component()` call site instead of
 *  as `static` fields. A subclass's own `static priority` / `static scheduler`
 *  still wins if it also declares them. */
interface ComponentOptions<TBase extends Constructor<HTMLElement> = typeof HTMLElement, TProviders extends readonly ComponentProvider[] = readonly ComponentProvider[]> {
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
declare function Component<TProps = {}, TBase extends Constructor<HTMLElement> = typeof HTMLElement, const TProviders extends readonly ComponentProvider[] = readonly []>(tagName?: string, baseOrOptions?: TBase | ComponentOptions<TBase, TProviders>, options?: ComponentOptions<TBase, TProviders>): (((abstract new (...args: any[]) => {
    /** Reflect an observed attribute into its prop (later attribute changes). */
    attributeChangedCallback(name: string, _old: string | null, value: string | null): void;
    /** Coerce an attribute string to the prop's default type and assign it. */
    #reflectAttr(prop: string, value: string | null): void;
    #root: ShadowRoot | HTMLElement;
    #usesShadow: boolean;
    #frozen: boolean;
    #recovering: boolean;
    #parts?: Part[];
    #lastStrings?: TemplateStringsArray;
    #connected: boolean;
    #mounted: boolean;
    #disposed: boolean;
    #version: number;
    #id: number;
    #controller: AbortController;
    #cleanups: (() => void)[];
    /** `this.listen()` subscriptions, for the devtools listener listing. */
    #listenerLog: ListenerInfo[];
    /** Per-instance scheduler override (runtime swap via devtools/setScheduler). */
    #schedulerOverride?: Scheduler;
    /** Active game-loop ticks -> their current unsubscribe, so a scheduler swap
     *  can move them onto the new scheduler's frame loop. */
    #frameStops: Map<(dt: number) => void, () => void>;
    /** Props passed to `new View({...})`; applied in connectedCallback AFTER
     *  field initializers + @prop upgrade, so they win over defaults. */
    #pendingProps?: Record<string, unknown>;
    /** Slot content (light DOM) projected into a `<slot>` — for islands/SSR. */
    #pendingSlot?: SlotContent;
    get version(): number;
    /** Aborted on disconnect — pass to `addEventListener` / `fetch` / `this.task`'s
     *  `{ signal }`. (Named `abortSignal` so `this.signal()` is free for reactive
     *  state — Preact/Angular signals.) */
    get abortSignal(): AbortSignal;
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
    signal<T>(initial: T, options?: SignalOptions<T> | undefined): Signal<T>;
    /** Memoized derived signal scoped to this host — recomputes lazily when the
     *  signals it reads change. */
    computed<T>(compute: () => T, options?: SignalOptions<T> | undefined): ReadonlySignal<T>;
    /**
     * Run `fn` now and re-run it whenever the signals it reads change — for side
     * effects (logging, imperative DOM, syncing to storage). `fn` may return a
     * cleanup that runs before each re-run and on disconnect. Auto-stopped on
     * disconnect; the returned disposer stops it early.
     */
    effect(fn: () => void | (() => void)): () => void;
    get #scheduler(): Scheduler;
    /**
     * Swap this instance's scheduler at runtime (devtools / debugging). Pass
     * `undefined` to revert to the class's `static scheduler` / global default.
     * Re-renders via the new scheduler so the change takes effect immediately.
     */
    setScheduler(scheduler?: Scheduler): void;
    /** DOM depth (crosses shadow boundaries) — parents flush before children. */
    get depth(): number;
    #tag(): string;
    #snapshot(): Record<string, unknown>;
    #styleRules(): StyleRule[];
    #selectorApplies(selector: string): boolean;
    /** Nearest ancestor component's id, climbing parents + shadow hosts. */
    #parentId(): number | undefined;
    /** Active listeners: explicit `listen()` calls + template `@event` bindings. */
    #collectListeners(): ListenerInfo[];
    #devtools(kind: DevtoolsEvent["kind"], emit?: DevtoolsEvent["emit"]): void;
    connectedCallback(): void;
    /** Resolve any lazy style thunks and adopt the sheets once they load. The
     *  component has already rendered with its synchronous styles by now, so
     *  these arrive late (FOUC) — see `ComponentOptions.styles`. */
    #loadLazyStyles(): void;
    /** Light-DOM children projected into this component's `<slot>` — for render
     *  logic (fallbacks, counts, wrapping). The `<slot>` element projects them
     *  automatically; use this only when you need to branch on the content. */
    slotted(): Element[];
    getAttribute: (<S extends AnyString<string> | PropNames</*elided*/ any>>(qualifiedName: S) => string | null) & ((qualifiedName: string) => string | null);
    /** Like getAttribute, but typed to the prop: a known `@prop` name returns
     *  that prop's value (read off the instance), otherwise the raw attribute. */
    attr<S extends AnyString<string> | PropNames</*elided*/ any>>(name: S): string | (S extends keyof /*elided*/ any ? /*elided*/ any[S] : never) | null;
    disconnectedCallback(): void;
    requestUpdate(priority?: Priority): void;
    /** Render now — called by the scheduler (implements SchedulerHost). */
    flush(): void;
    /** Flush this host's scheduler synchronously (SSR/SSG, tests). */
    flushSync(): void;
    /** Register teardown to run on disconnect / dispose. */
    onCleanup(teardown: () => void): void;
    /**
     * Create an abortable async task bound to this host — sugar for the
     * standalone `task(this, …)`, so you don't have to pass `this`:
     *
     *   load = this.task(async (id, signal) => fetch(`/x/${id}`, { signal }), { priority: "background" });
     *
     * The previous run is aborted when a new one starts and on disconnect; its
     * `pending` / `value` / `error` updates are scheduled at `options.priority`.
     */
    task<A extends unknown[], R>(fn: (...args: [...A, AbortSignal]) => Promise<R>, options?: TaskOptions): Task<A, R, unknown>;
    /** This instance's live scoped stylesheets. Mutate one in place
     *  (`getStyles()[0].replaceSync(…)`) to restyle at runtime — note `css`
     *  sheets shared across components are shared state. Prefer `setStyles()`
     *  for a clean per-instance swap. */
    getStyles(): CSSStyleSheet[];
    /** Replace this instance's scoped styles at runtime (per-instance — does
     *  not touch sheets shared via `static styles` / Component options).
     *  No-op in light-DOM mode (no scoping target). */
    setStyles(input: StyleInput | StyleInput[]): void;
    /**
     * Game-loop tick (dt in ms) on this host's scheduler — runs every frame,
     * even with no reactive change; state set inside renders the same frame.
     * Auto-stops on disconnect. Use a frame scheduler (`static scheduler =
     * createFpsScheduler(n)`); otherwise falls back to the rAF scheduler.
     */
    onFrame(callback: (dt: number) => void): () => void;
    /** (Re)subscribe a game-loop tick on the CURRENT scheduler, tracking its
     *  unsubscribe so a later scheduler swap can move it. */
    #subscribeFrame(callback: (dt: number) => void): void;
    /** addEventListener that auto-unsubscribes on disconnect. */
    listen<T extends EventTarget>(target: T, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
    /** Dispatch a CustomEvent (Angular @Output / Vue emit). Bubbling + composed
     *  by default so a parent's `@type=${fn}` (even across a shadow boundary)
     *  catches it; `flags` overrides those for one dispatch. */
    emit<T = unknown>(type: string, detail?: T | undefined, flags?: {
        bubbles?: boolean;
        composed?: boolean;
        cancelable?: boolean;
    } | undefined): void;
    #upgradeProp(name: string): void;
    /** Write a prop value to an attribute: booleans toggle presence, others stringify. */
    #writeAttr(attr: string, value: unknown): void;
    #render(): void;
    /** Route a caught error to this component's `onError` boundary (once per
     *  failed render cycle), else to the global handler. */
    #handleError(error: unknown, phase: ErrorPhase): void;
    #renderInner(): void;
    render(): TemplateResult | Node;
    /** Explicit disposal (TC39 `using`) — same teardown as disconnect. */
    [Symbol.dispose](): void;
    accessKey: string;
    readonly accessKeyLabel: string;
    autocapitalize: string;
    autocorrect: boolean;
    dir: string;
    draggable: boolean;
    hidden: boolean;
    inert: boolean;
    innerText: string;
    lang: string;
    readonly offsetHeight: number;
    readonly offsetLeft: number;
    readonly offsetParent: Element | null;
    readonly offsetTop: number;
    readonly offsetWidth: number;
    outerText: string;
    popover: string | null;
    spellcheck: boolean;
    title: string;
    translate: boolean;
    writingSuggestions: string;
    attachInternals(): ElementInternals;
    click(): void;
    hidePopover(): void;
    showPopover(): void;
    togglePopover(options?: boolean): boolean;
    addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    readonly attributes: NamedNodeMap;
    get classList(): DOMTokenList;
    set classList(value: string);
    className: string;
    readonly clientHeight: number;
    readonly clientLeft: number;
    readonly clientTop: number;
    readonly clientWidth: number;
    readonly currentCSSZoom: number;
    id: string;
    innerHTML: string;
    readonly localName: string;
    readonly namespaceURI: string | null;
    onfullscreenchange: ((this: Element, ev: Event) => any) | null;
    onfullscreenerror: ((this: Element, ev: Event) => any) | null;
    outerHTML: string;
    readonly ownerDocument: Document;
    get part(): DOMTokenList;
    set part(value: string);
    readonly prefix: string | null;
    readonly scrollHeight: number;
    scrollLeft: number;
    scrollTop: number;
    readonly scrollWidth: number;
    readonly shadowRoot: ShadowRoot | null;
    slot: string;
    readonly tagName: string;
    attachShadow(init: ShadowRootInit): ShadowRoot;
    checkVisibility(options?: CheckVisibilityOptions): boolean;
    closest<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K] | null;
    closest<K extends keyof SVGElementTagNameMap>(selector: K): SVGElementTagNameMap[K] | null;
    closest<K extends keyof MathMLElementTagNameMap>(selector: K): MathMLElementTagNameMap[K] | null;
    closest<E extends Element = Element>(selectors: string): E | null;
    computedStyleMap(): StylePropertyMapReadOnly;
    getAttributeNS(namespace: string | null, localName: string): string | null;
    getAttributeNames(): string[];
    getAttributeNode(qualifiedName: string): Attr | null;
    getAttributeNodeNS(namespace: string | null, localName: string): Attr | null;
    getBoundingClientRect(): DOMRect;
    getClientRects(): DOMRectList;
    getElementsByClassName(classNames: string): HTMLCollectionOf<Element>;
    getElementsByTagName<K extends keyof HTMLElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<HTMLElementTagNameMap[K]>;
    getElementsByTagName<K extends keyof SVGElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<SVGElementTagNameMap[K]>;
    getElementsByTagName<K extends keyof MathMLElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<MathMLElementTagNameMap[K]>;
    getElementsByTagName<K extends keyof HTMLElementDeprecatedTagNameMap>(qualifiedName: K): HTMLCollectionOf<HTMLElementDeprecatedTagNameMap[K]>;
    getElementsByTagName(qualifiedName: string): HTMLCollectionOf<Element>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1999/xhtml", localName: string): HTMLCollectionOf<HTMLElement>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/2000/svg", localName: string): HTMLCollectionOf<SVGElement>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1998/Math/MathML", localName: string): HTMLCollectionOf<MathMLElement>;
    getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollectionOf<Element>;
    getHTML(options?: GetHTMLOptions): string;
    hasAttribute(qualifiedName: string): boolean;
    hasAttributeNS(namespace: string | null, localName: string): boolean;
    hasAttributes(): boolean;
    hasPointerCapture(pointerId: number): boolean;
    insertAdjacentElement(where: InsertPosition, element: Element): Element | null;
    insertAdjacentHTML(position: InsertPosition, string: string): void;
    insertAdjacentText(where: InsertPosition, data: string): void;
    matches(selectors: string): boolean;
    releasePointerCapture(pointerId: number): void;
    removeAttribute(qualifiedName: string): void;
    removeAttributeNS(namespace: string | null, localName: string): void;
    removeAttributeNode(attr: Attr): Attr;
    requestFullscreen(options?: FullscreenOptions): Promise<void>;
    requestPointerLock(options?: PointerLockOptions): Promise<void>;
    scroll(options?: ScrollToOptions): void;
    scroll(x: number, y: number): void;
    scrollBy(options?: ScrollToOptions): void;
    scrollBy(x: number, y: number): void;
    scrollIntoView(arg?: boolean | ScrollIntoViewOptions): void;
    scrollTo(options?: ScrollToOptions): void;
    scrollTo(x: number, y: number): void;
    setAttribute(qualifiedName: string, value: string): void;
    setAttributeNS(namespace: string | null, qualifiedName: string, value: string): void;
    setAttributeNode(attr: Attr): Attr | null;
    setAttributeNodeNS(attr: Attr): Attr | null;
    setHTMLUnsafe(html: string): void;
    setPointerCapture(pointerId: number): void;
    toggleAttribute(qualifiedName: string, force?: boolean): boolean;
    webkitMatchesSelector(selectors: string): boolean;
    get textContent(): string;
    set textContent(value: string | null);
    readonly baseURI: string;
    readonly childNodes: NodeListOf<ChildNode>;
    readonly firstChild: ChildNode | null;
    readonly isConnected: boolean;
    readonly lastChild: ChildNode | null;
    readonly nextSibling: ChildNode | null;
    readonly nodeName: string;
    readonly nodeType: number;
    nodeValue: string | null;
    readonly parentElement: HTMLElement | null;
    readonly parentNode: ParentNode | null;
    readonly previousSibling: ChildNode | null;
    appendChild<T extends Node>(node: T): T;
    cloneNode(subtree?: boolean): Node;
    compareDocumentPosition(other: Node): number;
    contains(other: Node | null): boolean;
    getRootNode(options?: GetRootNodeOptions): Node;
    hasChildNodes(): boolean;
    insertBefore<T extends Node>(node: T, child: Node | null): T;
    isDefaultNamespace(namespace: string | null): boolean;
    isEqualNode(otherNode: Node | null): boolean;
    isSameNode(otherNode: Node | null): boolean;
    lookupNamespaceURI(prefix: string | null): string | null;
    lookupPrefix(namespace: string | null): string | null;
    normalize(): void;
    removeChild<T extends Node>(child: T): T;
    replaceChild<T extends Node>(node: Node, child: T): T;
    readonly ELEMENT_NODE: 1;
    readonly ATTRIBUTE_NODE: 2;
    readonly TEXT_NODE: 3;
    readonly CDATA_SECTION_NODE: 4;
    readonly ENTITY_REFERENCE_NODE: 5;
    readonly ENTITY_NODE: 6;
    readonly PROCESSING_INSTRUCTION_NODE: 7;
    readonly COMMENT_NODE: 8;
    readonly DOCUMENT_NODE: 9;
    readonly DOCUMENT_TYPE_NODE: 10;
    readonly DOCUMENT_FRAGMENT_NODE: 11;
    readonly NOTATION_NODE: 12;
    readonly DOCUMENT_POSITION_DISCONNECTED: 1;
    readonly DOCUMENT_POSITION_PRECEDING: 2;
    readonly DOCUMENT_POSITION_FOLLOWING: 4;
    readonly DOCUMENT_POSITION_CONTAINS: 8;
    readonly DOCUMENT_POSITION_CONTAINED_BY: 16;
    readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32;
    dispatchEvent(event: Event): boolean;
    ariaActiveDescendantElement: Element | null;
    ariaAtomic: string | null;
    ariaAutoComplete: string | null;
    ariaBrailleLabel: string | null;
    ariaBrailleRoleDescription: string | null;
    ariaBusy: string | null;
    ariaChecked: string | null;
    ariaColCount: string | null;
    ariaColIndex: string | null;
    ariaColIndexText: string | null;
    ariaColSpan: string | null;
    ariaControlsElements: ReadonlyArray<Element> | null;
    ariaCurrent: string | null;
    ariaDescribedByElements: ReadonlyArray<Element> | null;
    ariaDescription: string | null;
    ariaDetailsElements: ReadonlyArray<Element> | null;
    ariaDisabled: string | null;
    ariaErrorMessageElements: ReadonlyArray<Element> | null;
    ariaExpanded: string | null;
    ariaFlowToElements: ReadonlyArray<Element> | null;
    ariaHasPopup: string | null;
    ariaHidden: string | null;
    ariaInvalid: string | null;
    ariaKeyShortcuts: string | null;
    ariaLabel: string | null;
    ariaLabelledByElements: ReadonlyArray<Element> | null;
    ariaLevel: string | null;
    ariaLive: string | null;
    ariaModal: string | null;
    ariaMultiLine: string | null;
    ariaMultiSelectable: string | null;
    ariaOrientation: string | null;
    ariaOwnsElements: ReadonlyArray<Element> | null;
    ariaPlaceholder: string | null;
    ariaPosInSet: string | null;
    ariaPressed: string | null;
    ariaReadOnly: string | null;
    ariaRelevant: string | null;
    ariaRequired: string | null;
    ariaRoleDescription: string | null;
    ariaRowCount: string | null;
    ariaRowIndex: string | null;
    ariaRowIndexText: string | null;
    ariaRowSpan: string | null;
    ariaSelected: string | null;
    ariaSetSize: string | null;
    ariaSort: string | null;
    ariaValueMax: string | null;
    ariaValueMin: string | null;
    ariaValueNow: string | null;
    ariaValueText: string | null;
    role: string | null;
    animate(keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions): Animation;
    getAnimations(options?: GetAnimationsOptions): Animation[];
    after(...nodes: (Node | string)[]): void;
    before(...nodes: (Node | string)[]): void;
    remove(): void;
    replaceWith(...nodes: (Node | string)[]): void;
    readonly nextElementSibling: Element | null;
    readonly previousElementSibling: Element | null;
    readonly childElementCount: number;
    readonly children: HTMLCollection;
    readonly firstElementChild: Element | null;
    readonly lastElementChild: Element | null;
    append(...nodes: (Node | string)[]): void;
    prepend(...nodes: (Node | string)[]): void;
    querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
    querySelector<K extends keyof SVGElementTagNameMap>(selectors: K): SVGElementTagNameMap[K] | null;
    querySelector<K extends keyof MathMLElementTagNameMap>(selectors: K): MathMLElementTagNameMap[K] | null;
    querySelector<K extends keyof HTMLElementDeprecatedTagNameMap>(selectors: K): HTMLElementDeprecatedTagNameMap[K] | null;
    querySelector<E extends Element = Element>(selectors: string): E | null;
    querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeListOf<HTMLElementTagNameMap[K]>;
    querySelectorAll<K extends keyof SVGElementTagNameMap>(selectors: K): NodeListOf<SVGElementTagNameMap[K]>;
    querySelectorAll<K extends keyof MathMLElementTagNameMap>(selectors: K): NodeListOf<MathMLElementTagNameMap[K]>;
    querySelectorAll<K extends keyof HTMLElementDeprecatedTagNameMap>(selectors: K): NodeListOf<HTMLElementDeprecatedTagNameMap[K]>;
    querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
    replaceChildren(...nodes: (Node | string)[]): void;
    readonly assignedSlot: HTMLSlotElement | null;
    readonly attributeStyleMap: StylePropertyMap;
    get style(): CSSStyleDeclaration;
    set style(cssText: string);
    contentEditable: string;
    enterKeyHint: string;
    inputMode: string;
    readonly isContentEditable: boolean;
    onabort: ((this: GlobalEventHandlers, ev: UIEvent) => any) | null;
    onanimationcancel: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
    onanimationend: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
    onanimationiteration: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
    onanimationstart: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
    onauxclick: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onbeforeinput: ((this: GlobalEventHandlers, ev: InputEvent) => any) | null;
    onbeforematch: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onbeforetoggle: ((this: GlobalEventHandlers, ev: ToggleEvent) => any) | null;
    onblur: ((this: GlobalEventHandlers, ev: FocusEvent) => any) | null;
    oncancel: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oncanplay: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oncanplaythrough: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onclick: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onclose: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oncontextlost: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oncontextmenu: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    oncontextrestored: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oncopy: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
    oncuechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oncut: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
    ondblclick: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    ondrag: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondragend: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondragenter: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondragleave: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondragover: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondragstart: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondrop: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
    ondurationchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onemptied: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onended: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onerror: OnErrorEventHandler;
    onfocus: ((this: GlobalEventHandlers, ev: FocusEvent) => any) | null;
    onformdata: ((this: GlobalEventHandlers, ev: FormDataEvent) => any) | null;
    ongotpointercapture: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    oninput: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    oninvalid: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onkeydown: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
    onkeypress: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
    onkeyup: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
    onload: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onloadeddata: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onloadedmetadata: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onloadstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onlostpointercapture: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onmousedown: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onmouseenter: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onmouseleave: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onmousemove: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onmouseout: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onmouseover: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onmouseup: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
    onpaste: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
    onpause: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onplay: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onplaying: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onpointercancel: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointerdown: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointerenter: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointerleave: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointermove: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointerout: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointerover: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onpointerrawupdate: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onpointerup: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
    onprogress: ((this: GlobalEventHandlers, ev: ProgressEvent) => any) | null;
    onratechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onreset: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onresize: ((this: GlobalEventHandlers, ev: UIEvent) => any) | null;
    onscroll: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onscrollend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onsecuritypolicyviolation: ((this: GlobalEventHandlers, ev: SecurityPolicyViolationEvent) => any) | null;
    onseeked: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onseeking: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onselect: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onselectionchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onselectstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onslotchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onstalled: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onsubmit: ((this: GlobalEventHandlers, ev: SubmitEvent) => any) | null;
    onsuspend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    ontimeupdate: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    ontoggle: ((this: GlobalEventHandlers, ev: ToggleEvent) => any) | null;
    ontouchcancel?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
    ontouchend?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
    ontouchmove?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
    ontouchstart?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
    ontransitioncancel: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
    ontransitionend: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
    ontransitionrun: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
    ontransitionstart: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
    onvolumechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onwaiting: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onwebkitanimationend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onwebkitanimationiteration: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onwebkitanimationstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onwebkittransitionend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
    onwheel: ((this: GlobalEventHandlers, ev: WheelEvent) => any) | null;
    autofocus: boolean;
    readonly dataset: DOMStringMap;
    nonce?: string;
    tabIndex: number;
    blur(): void;
    focus(options?: FocusOptions): void;
}) & {
    tagName: string;
    /** Default update priority for this component (override per class). */
    priority: Priority;
    /** Optional per-component scheduler; falls back to the global default. */
    scheduler?: Scheduler;
    /** Render into a Shadow DOM root (default). `false` → light-DOM mode. */
    shadow: boolean;
    /** Attributes to observe — the ones declared via `@prop({ attribute })`. */
    get observedAttributes(): string[];
    /** Typed factory: `UserView.of({ user })` autocompletes/checks the props of
     *  THIS class (its `_typed_props` contract if it declares one, else its data
     *  fields). Polymorphic `this` works on a static method, unlike the
     *  constructor. Optional `slot` is projected into a `<slot>` (islands/SSR).
     *  Prefer it over `new View({…})` when you want type-safety. */
    of<T extends {
        /** Reflect an observed attribute into its prop (later attribute changes). */
        attributeChangedCallback(name: string, _old: string | null, value: string | null): void;
        /** Coerce an attribute string to the prop's default type and assign it. */
        #reflectAttr(prop: string, value: string | null): void;
        #root: ShadowRoot | HTMLElement;
        #usesShadow: boolean;
        #frozen: boolean;
        #recovering: boolean;
        #parts?: Part[];
        #lastStrings?: TemplateStringsArray;
        #connected: boolean;
        #mounted: boolean;
        #disposed: boolean;
        #version: number;
        #id: number;
        #controller: AbortController;
        #cleanups: (() => void)[];
        /** `this.listen()` subscriptions, for the devtools listener listing. */
        #listenerLog: ListenerInfo[];
        /** Per-instance scheduler override (runtime swap via devtools/setScheduler). */
        #schedulerOverride?: Scheduler;
        /** Active game-loop ticks -> their current unsubscribe, so a scheduler swap
         *  can move them onto the new scheduler's frame loop. */
        #frameStops: Map<(dt: number) => void, () => void>;
        /** Props passed to `new View({...})`; applied in connectedCallback AFTER
         *  field initializers + @prop upgrade, so they win over defaults. */
        #pendingProps?: Record<string, unknown>;
        /** Slot content (light DOM) projected into a `<slot>` — for islands/SSR. */
        #pendingSlot?: SlotContent;
        get version(): number;
        /** Aborted on disconnect — pass to `addEventListener` / `fetch` / `this.task`'s
         *  `{ signal }`. (Named `abortSignal` so `this.signal()` is free for reactive
         *  state — Preact/Angular signals.) */
        get abortSignal(): AbortSignal;
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
        signal<T_1>(initial: T_1, options?: SignalOptions<T_1> | undefined): Signal<T_1>;
        /** Memoized derived signal scoped to this host — recomputes lazily when the
         *  signals it reads change. */
        computed<T_1>(compute: () => T_1, options?: SignalOptions<T_1> | undefined): ReadonlySignal<T_1>;
        /**
         * Run `fn` now and re-run it whenever the signals it reads change — for side
         * effects (logging, imperative DOM, syncing to storage). `fn` may return a
         * cleanup that runs before each re-run and on disconnect. Auto-stopped on
         * disconnect; the returned disposer stops it early.
         */
        effect(fn: () => void | (() => void)): () => void;
        get #scheduler(): Scheduler;
        /**
         * Swap this instance's scheduler at runtime (devtools / debugging). Pass
         * `undefined` to revert to the class's `static scheduler` / global default.
         * Re-renders via the new scheduler so the change takes effect immediately.
         */
        setScheduler(scheduler?: Scheduler): void;
        /** DOM depth (crosses shadow boundaries) — parents flush before children. */
        get depth(): number;
        #tag(): string;
        #snapshot(): Record<string, unknown>;
        #styleRules(): StyleRule[];
        #selectorApplies(selector: string): boolean;
        /** Nearest ancestor component's id, climbing parents + shadow hosts. */
        #parentId(): number | undefined;
        /** Active listeners: explicit `listen()` calls + template `@event` bindings. */
        #collectListeners(): ListenerInfo[];
        #devtools(kind: DevtoolsEvent["kind"], emit?: DevtoolsEvent["emit"]): void;
        connectedCallback(): void;
        /** Resolve any lazy style thunks and adopt the sheets once they load. The
         *  component has already rendered with its synchronous styles by now, so
         *  these arrive late (FOUC) — see `ComponentOptions.styles`. */
        #loadLazyStyles(): void;
        /** Light-DOM children projected into this component's `<slot>` — for render
         *  logic (fallbacks, counts, wrapping). The `<slot>` element projects them
         *  automatically; use this only when you need to branch on the content. */
        slotted(): Element[];
        /**
         * Typed attribute read: the component's `@prop` names autocomplete (other
         * strings still allowed via the AnyString trick). The return type stays
         * `string | null` — attributes ARE strings, and overriding `Element`'s
         * signature can't widen the return without breaking the base contract. For a
         * typed VALUE, read the prop directly (`this.count`) or use `attr()`.
         */
        getAttribute<S extends AnyString<string> | PropNames</*elided*/ any>>(qualifiedName: S): string | null;
        /** Like getAttribute, but typed to the prop: a known `@prop` name returns
         *  that prop's value (read off the instance), otherwise the raw attribute. */
        attr<S extends AnyString<string> | PropNames</*elided*/ any>>(name: S): string | (S extends keyof /*elided*/ any ? /*elided*/ any[S] : never) | null;
        disconnectedCallback(): void;
        requestUpdate(priority?: Priority): void;
        /** Render now — called by the scheduler (implements SchedulerHost). */
        flush(): void;
        /** Flush this host's scheduler synchronously (SSR/SSG, tests). */
        flushSync(): void;
        /** Register teardown to run on disconnect / dispose. */
        onCleanup(teardown: () => void): void;
        /**
         * Create an abortable async task bound to this host — sugar for the
         * standalone `task(this, …)`, so you don't have to pass `this`:
         *
         *   load = this.task(async (id, signal) => fetch(`/x/${id}`, { signal }), { priority: "background" });
         *
         * The previous run is aborted when a new one starts and on disconnect; its
         * `pending` / `value` / `error` updates are scheduled at `options.priority`.
         */
        task<A extends unknown[], R>(fn: (...args: [...A, AbortSignal]) => Promise<R>, options?: TaskOptions): Task<A, R, unknown>;
        /** This instance's live scoped stylesheets. Mutate one in place
         *  (`getStyles()[0].replaceSync(…)`) to restyle at runtime — note `css`
         *  sheets shared across components are shared state. Prefer `setStyles()`
         *  for a clean per-instance swap. */
        getStyles(): CSSStyleSheet[];
        /** Replace this instance's scoped styles at runtime (per-instance — does
         *  not touch sheets shared via `static styles` / Component options).
         *  No-op in light-DOM mode (no scoping target). */
        setStyles(input: StyleInput | StyleInput[]): void;
        /**
         * Game-loop tick (dt in ms) on this host's scheduler — runs every frame,
         * even with no reactive change; state set inside renders the same frame.
         * Auto-stops on disconnect. Use a frame scheduler (`static scheduler =
         * createFpsScheduler(n)`); otherwise falls back to the rAF scheduler.
         */
        onFrame(callback: (dt: number) => void): () => void;
        /** (Re)subscribe a game-loop tick on the CURRENT scheduler, tracking its
         *  unsubscribe so a later scheduler swap can move it. */
        #subscribeFrame(callback: (dt: number) => void): void;
        /** addEventListener that auto-unsubscribes on disconnect. */
        listen<T_1 extends EventTarget>(target: T_1, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
        /** Dispatch a CustomEvent (Angular @Output / Vue emit). Bubbling + composed
         *  by default so a parent's `@type=${fn}` (even across a shadow boundary)
         *  catches it; `flags` overrides those for one dispatch. */
        emit<T_1 = unknown>(type: string, detail?: T_1 | undefined, flags?: {
            bubbles?: boolean;
            composed?: boolean;
            cancelable?: boolean;
        } | undefined): void;
        #upgradeProp(name: string): void;
        /** Write a prop value to an attribute: booleans toggle presence, others stringify. */
        #writeAttr(attr: string, value: unknown): void;
        #render(): void;
        /** Route a caught error to this component's `onError` boundary (once per
         *  failed render cycle), else to the global handler. */
        #handleError(error: unknown, phase: ErrorPhase): void;
        #renderInner(): void;
        render(): TemplateResult | Node;
        /** Explicit disposal (TC39 `using`) — same teardown as disconnect. */
        [Symbol.dispose](): void;
        accessKey: string;
        readonly accessKeyLabel: string;
        autocapitalize: string;
        autocorrect: boolean;
        dir: string;
        draggable: boolean;
        hidden: boolean;
        inert: boolean;
        innerText: string;
        lang: string;
        readonly offsetHeight: number;
        readonly offsetLeft: number;
        readonly offsetParent: Element | null;
        readonly offsetTop: number;
        readonly offsetWidth: number;
        outerText: string;
        popover: string | null;
        spellcheck: boolean;
        title: string;
        translate: boolean;
        writingSuggestions: string;
        attachInternals(): ElementInternals;
        click(): void;
        hidePopover(): void;
        showPopover(): void;
        togglePopover(options?: boolean): boolean;
        addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
        removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
        readonly attributes: NamedNodeMap;
        get classList(): DOMTokenList;
        set classList(value: string);
        className: string;
        readonly clientHeight: number;
        readonly clientLeft: number;
        readonly clientTop: number;
        readonly clientWidth: number;
        readonly currentCSSZoom: number;
        id: string;
        innerHTML: string;
        readonly localName: string;
        readonly namespaceURI: string | null;
        onfullscreenchange: ((this: Element, ev: Event) => any) | null;
        onfullscreenerror: ((this: Element, ev: Event) => any) | null;
        outerHTML: string;
        readonly ownerDocument: Document;
        get part(): DOMTokenList;
        set part(value: string);
        readonly prefix: string | null;
        readonly scrollHeight: number;
        scrollLeft: number;
        scrollTop: number;
        readonly scrollWidth: number;
        readonly shadowRoot: ShadowRoot | null;
        slot: string;
        readonly tagName: string;
        attachShadow(init: ShadowRootInit): ShadowRoot;
        checkVisibility(options?: CheckVisibilityOptions): boolean;
        closest<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K] | null;
        closest<K extends keyof SVGElementTagNameMap>(selector: K): SVGElementTagNameMap[K] | null;
        closest<K extends keyof MathMLElementTagNameMap>(selector: K): MathMLElementTagNameMap[K] | null;
        closest<E extends Element = Element>(selectors: string): E | null;
        computedStyleMap(): StylePropertyMapReadOnly;
        getAttributeNS(namespace: string | null, localName: string): string | null;
        getAttributeNames(): string[];
        getAttributeNode(qualifiedName: string): Attr | null;
        getAttributeNodeNS(namespace: string | null, localName: string): Attr | null;
        getBoundingClientRect(): DOMRect;
        getClientRects(): DOMRectList;
        getElementsByClassName(classNames: string): HTMLCollectionOf<Element>;
        getElementsByTagName<K extends keyof HTMLElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<HTMLElementTagNameMap[K]>;
        getElementsByTagName<K extends keyof SVGElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<SVGElementTagNameMap[K]>;
        getElementsByTagName<K extends keyof MathMLElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<MathMLElementTagNameMap[K]>;
        getElementsByTagName<K extends keyof HTMLElementDeprecatedTagNameMap>(qualifiedName: K): HTMLCollectionOf<HTMLElementDeprecatedTagNameMap[K]>;
        getElementsByTagName(qualifiedName: string): HTMLCollectionOf<Element>;
        getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1999/xhtml", localName: string): HTMLCollectionOf<HTMLElement>;
        getElementsByTagNameNS(namespaceURI: "http://www.w3.org/2000/svg", localName: string): HTMLCollectionOf<SVGElement>;
        getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1998/Math/MathML", localName: string): HTMLCollectionOf<MathMLElement>;
        getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollectionOf<Element>;
        getHTML(options?: GetHTMLOptions): string;
        hasAttribute(qualifiedName: string): boolean;
        hasAttributeNS(namespace: string | null, localName: string): boolean;
        hasAttributes(): boolean;
        hasPointerCapture(pointerId: number): boolean;
        insertAdjacentElement(where: InsertPosition, element: Element): Element | null;
        insertAdjacentHTML(position: InsertPosition, string: string): void;
        insertAdjacentText(where: InsertPosition, data: string): void;
        matches(selectors: string): boolean;
        releasePointerCapture(pointerId: number): void;
        removeAttribute(qualifiedName: string): void;
        removeAttributeNS(namespace: string | null, localName: string): void;
        removeAttributeNode(attr: Attr): Attr;
        requestFullscreen(options?: FullscreenOptions): Promise<void>;
        requestPointerLock(options?: PointerLockOptions): Promise<void>;
        scroll(options?: ScrollToOptions): void;
        scroll(x: number, y: number): void;
        scrollBy(options?: ScrollToOptions): void;
        scrollBy(x: number, y: number): void;
        scrollIntoView(arg?: boolean | ScrollIntoViewOptions): void;
        scrollTo(options?: ScrollToOptions): void;
        scrollTo(x: number, y: number): void;
        setAttribute(qualifiedName: string, value: string): void;
        setAttributeNS(namespace: string | null, qualifiedName: string, value: string): void;
        setAttributeNode(attr: Attr): Attr | null;
        setAttributeNodeNS(attr: Attr): Attr | null;
        setHTMLUnsafe(html: string): void;
        setPointerCapture(pointerId: number): void;
        toggleAttribute(qualifiedName: string, force?: boolean): boolean;
        webkitMatchesSelector(selectors: string): boolean;
        get textContent(): string;
        set textContent(value: string | null);
        readonly baseURI: string;
        readonly childNodes: NodeListOf<ChildNode>;
        readonly firstChild: ChildNode | null;
        readonly isConnected: boolean;
        readonly lastChild: ChildNode | null;
        readonly nextSibling: ChildNode | null;
        readonly nodeName: string;
        readonly nodeType: number;
        nodeValue: string | null;
        readonly parentElement: HTMLElement | null;
        readonly parentNode: ParentNode | null;
        readonly previousSibling: ChildNode | null;
        appendChild<T_1 extends Node>(node: T_1): T_1;
        cloneNode(subtree?: boolean): Node;
        compareDocumentPosition(other: Node): number;
        contains(other: Node | null): boolean;
        getRootNode(options?: GetRootNodeOptions): Node;
        hasChildNodes(): boolean;
        insertBefore<T_1 extends Node>(node: T_1, child: Node | null): T_1;
        isDefaultNamespace(namespace: string | null): boolean;
        isEqualNode(otherNode: Node | null): boolean;
        isSameNode(otherNode: Node | null): boolean;
        lookupNamespaceURI(prefix: string | null): string | null;
        lookupPrefix(namespace: string | null): string | null;
        normalize(): void;
        removeChild<T_1 extends Node>(child: T_1): T_1;
        replaceChild<T_1 extends Node>(node: Node, child: T_1): T_1;
        readonly ELEMENT_NODE: 1;
        readonly ATTRIBUTE_NODE: 2;
        readonly TEXT_NODE: 3;
        readonly CDATA_SECTION_NODE: 4;
        readonly ENTITY_REFERENCE_NODE: 5;
        readonly ENTITY_NODE: 6;
        readonly PROCESSING_INSTRUCTION_NODE: 7;
        readonly COMMENT_NODE: 8;
        readonly DOCUMENT_NODE: 9;
        readonly DOCUMENT_TYPE_NODE: 10;
        readonly DOCUMENT_FRAGMENT_NODE: 11;
        readonly NOTATION_NODE: 12;
        readonly DOCUMENT_POSITION_DISCONNECTED: 1;
        readonly DOCUMENT_POSITION_PRECEDING: 2;
        readonly DOCUMENT_POSITION_FOLLOWING: 4;
        readonly DOCUMENT_POSITION_CONTAINS: 8;
        readonly DOCUMENT_POSITION_CONTAINED_BY: 16;
        readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32;
        dispatchEvent(event: Event): boolean;
        ariaActiveDescendantElement: Element | null;
        ariaAtomic: string | null;
        ariaAutoComplete: string | null;
        ariaBrailleLabel: string | null;
        ariaBrailleRoleDescription: string | null;
        ariaBusy: string | null;
        ariaChecked: string | null;
        ariaColCount: string | null;
        ariaColIndex: string | null;
        ariaColIndexText: string | null;
        ariaColSpan: string | null;
        ariaControlsElements: ReadonlyArray<Element> | null;
        ariaCurrent: string | null;
        ariaDescribedByElements: ReadonlyArray<Element> | null;
        ariaDescription: string | null;
        ariaDetailsElements: ReadonlyArray<Element> | null;
        ariaDisabled: string | null;
        ariaErrorMessageElements: ReadonlyArray<Element> | null;
        ariaExpanded: string | null;
        ariaFlowToElements: ReadonlyArray<Element> | null;
        ariaHasPopup: string | null;
        ariaHidden: string | null;
        ariaInvalid: string | null;
        ariaKeyShortcuts: string | null;
        ariaLabel: string | null;
        ariaLabelledByElements: ReadonlyArray<Element> | null;
        ariaLevel: string | null;
        ariaLive: string | null;
        ariaModal: string | null;
        ariaMultiLine: string | null;
        ariaMultiSelectable: string | null;
        ariaOrientation: string | null;
        ariaOwnsElements: ReadonlyArray<Element> | null;
        ariaPlaceholder: string | null;
        ariaPosInSet: string | null;
        ariaPressed: string | null;
        ariaReadOnly: string | null;
        ariaRelevant: string | null;
        ariaRequired: string | null;
        ariaRoleDescription: string | null;
        ariaRowCount: string | null;
        ariaRowIndex: string | null;
        ariaRowIndexText: string | null;
        ariaRowSpan: string | null;
        ariaSelected: string | null;
        ariaSetSize: string | null;
        ariaSort: string | null;
        ariaValueMax: string | null;
        ariaValueMin: string | null;
        ariaValueNow: string | null;
        ariaValueText: string | null;
        role: string | null;
        animate(keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions): Animation;
        getAnimations(options?: GetAnimationsOptions): Animation[];
        after(...nodes: (Node | string)[]): void;
        before(...nodes: (Node | string)[]): void;
        remove(): void;
        replaceWith(...nodes: (Node | string)[]): void;
        readonly nextElementSibling: Element | null;
        readonly previousElementSibling: Element | null;
        readonly childElementCount: number;
        readonly children: HTMLCollection;
        readonly firstElementChild: Element | null;
        readonly lastElementChild: Element | null;
        append(...nodes: (Node | string)[]): void;
        prepend(...nodes: (Node | string)[]): void;
        querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
        querySelector<K extends keyof SVGElementTagNameMap>(selectors: K): SVGElementTagNameMap[K] | null;
        querySelector<K extends keyof MathMLElementTagNameMap>(selectors: K): MathMLElementTagNameMap[K] | null;
        querySelector<K extends keyof HTMLElementDeprecatedTagNameMap>(selectors: K): HTMLElementDeprecatedTagNameMap[K] | null;
        querySelector<E extends Element = Element>(selectors: string): E | null;
        querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeListOf<HTMLElementTagNameMap[K]>;
        querySelectorAll<K extends keyof SVGElementTagNameMap>(selectors: K): NodeListOf<SVGElementTagNameMap[K]>;
        querySelectorAll<K extends keyof MathMLElementTagNameMap>(selectors: K): NodeListOf<MathMLElementTagNameMap[K]>;
        querySelectorAll<K extends keyof HTMLElementDeprecatedTagNameMap>(selectors: K): NodeListOf<HTMLElementDeprecatedTagNameMap[K]>;
        querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
        replaceChildren(...nodes: (Node | string)[]): void;
        readonly assignedSlot: HTMLSlotElement | null;
        readonly attributeStyleMap: StylePropertyMap;
        get style(): CSSStyleDeclaration;
        set style(cssText: string);
        contentEditable: string;
        enterKeyHint: string;
        inputMode: string;
        readonly isContentEditable: boolean;
        onabort: ((this: GlobalEventHandlers, ev: UIEvent) => any) | null;
        onanimationcancel: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onanimationend: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onanimationiteration: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onanimationstart: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onauxclick: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onbeforeinput: ((this: GlobalEventHandlers, ev: InputEvent) => any) | null;
        onbeforematch: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onbeforetoggle: ((this: GlobalEventHandlers, ev: ToggleEvent) => any) | null;
        onblur: ((this: GlobalEventHandlers, ev: FocusEvent) => any) | null;
        oncancel: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncanplay: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncanplaythrough: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onclick: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onclose: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncontextlost: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncontextmenu: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        oncontextrestored: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncopy: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
        oncuechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncut: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
        ondblclick: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        ondrag: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragend: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragenter: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragleave: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragover: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragstart: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondrop: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondurationchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onemptied: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onended: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onerror: OnErrorEventHandler;
        onfocus: ((this: GlobalEventHandlers, ev: FocusEvent) => any) | null;
        onformdata: ((this: GlobalEventHandlers, ev: FormDataEvent) => any) | null;
        ongotpointercapture: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        oninput: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oninvalid: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onkeydown: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
        onkeypress: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
        onkeyup: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
        onload: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onloadeddata: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onloadedmetadata: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onloadstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onlostpointercapture: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onmousedown: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseenter: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseleave: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmousemove: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseout: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseover: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseup: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onpaste: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
        onpause: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onplay: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onplaying: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onpointercancel: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerdown: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerenter: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerleave: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointermove: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerout: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerover: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerrawupdate: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onpointerup: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onprogress: ((this: GlobalEventHandlers, ev: ProgressEvent) => any) | null;
        onratechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onreset: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onresize: ((this: GlobalEventHandlers, ev: UIEvent) => any) | null;
        onscroll: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onscrollend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onsecuritypolicyviolation: ((this: GlobalEventHandlers, ev: SecurityPolicyViolationEvent) => any) | null;
        onseeked: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onseeking: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onselect: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onselectionchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onselectstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onslotchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onstalled: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onsubmit: ((this: GlobalEventHandlers, ev: SubmitEvent) => any) | null;
        onsuspend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        ontimeupdate: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        ontoggle: ((this: GlobalEventHandlers, ev: ToggleEvent) => any) | null;
        ontouchcancel?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontouchend?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontouchmove?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontouchstart?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontransitioncancel: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        ontransitionend: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        ontransitionrun: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        ontransitionstart: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        onvolumechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwaiting: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkitanimationend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkitanimationiteration: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkitanimationstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkittransitionend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwheel: ((this: GlobalEventHandlers, ev: WheelEvent) => any) | null;
        autofocus: boolean;
        readonly dataset: DOMStringMap;
        nonce?: string;
        tabIndex: number;
        blur(): void;
        focus(options?: FocusOptions): void;
    }>(this: new (...a: any[]) => T, props: PublicProps<T>, slot?: SlotContent): T;
}) & TBase) & (abstract new (...args: any[]) => ProviderContributions<TProviders>) & {
    of(props: TProps, slot?: SlotContent): {
        /** Reflect an observed attribute into its prop (later attribute changes). */
        attributeChangedCallback(name: string, _old: string | null, value: string | null): void;
        /** Coerce an attribute string to the prop's default type and assign it. */
        #reflectAttr(prop: string, value: string | null): void;
        #root: ShadowRoot | HTMLElement;
        #usesShadow: boolean;
        #frozen: boolean;
        #recovering: boolean;
        #parts?: Part[];
        #lastStrings?: TemplateStringsArray;
        #connected: boolean;
        #mounted: boolean;
        #disposed: boolean;
        #version: number;
        #id: number;
        #controller: AbortController;
        #cleanups: (() => void)[];
        /** `this.listen()` subscriptions, for the devtools listener listing. */
        #listenerLog: ListenerInfo[];
        /** Per-instance scheduler override (runtime swap via devtools/setScheduler). */
        #schedulerOverride?: Scheduler;
        /** Active game-loop ticks -> their current unsubscribe, so a scheduler swap
         *  can move them onto the new scheduler's frame loop. */
        #frameStops: Map<(dt: number) => void, () => void>;
        /** Props passed to `new View({...})`; applied in connectedCallback AFTER
         *  field initializers + @prop upgrade, so they win over defaults. */
        #pendingProps?: Record<string, unknown>;
        /** Slot content (light DOM) projected into a `<slot>` — for islands/SSR. */
        #pendingSlot?: SlotContent;
        get version(): number;
        /** Aborted on disconnect — pass to `addEventListener` / `fetch` / `this.task`'s
         *  `{ signal }`. (Named `abortSignal` so `this.signal()` is free for reactive
         *  state — Preact/Angular signals.) */
        get abortSignal(): AbortSignal;
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
        signal<T>(initial: T, options?: SignalOptions<T> | undefined): Signal<T>;
        /** Memoized derived signal scoped to this host — recomputes lazily when the
         *  signals it reads change. */
        computed<T>(compute: () => T, options?: SignalOptions<T> | undefined): ReadonlySignal<T>;
        /**
         * Run `fn` now and re-run it whenever the signals it reads change — for side
         * effects (logging, imperative DOM, syncing to storage). `fn` may return a
         * cleanup that runs before each re-run and on disconnect. Auto-stopped on
         * disconnect; the returned disposer stops it early.
         */
        effect(fn: () => void | (() => void)): () => void;
        get #scheduler(): Scheduler;
        /**
         * Swap this instance's scheduler at runtime (devtools / debugging). Pass
         * `undefined` to revert to the class's `static scheduler` / global default.
         * Re-renders via the new scheduler so the change takes effect immediately.
         */
        setScheduler(scheduler?: Scheduler): void;
        /** DOM depth (crosses shadow boundaries) — parents flush before children. */
        get depth(): number;
        #tag(): string;
        #snapshot(): Record<string, unknown>;
        #styleRules(): StyleRule[];
        #selectorApplies(selector: string): boolean;
        /** Nearest ancestor component's id, climbing parents + shadow hosts. */
        #parentId(): number | undefined;
        /** Active listeners: explicit `listen()` calls + template `@event` bindings. */
        #collectListeners(): ListenerInfo[];
        #devtools(kind: DevtoolsEvent["kind"], emit?: DevtoolsEvent["emit"]): void;
        connectedCallback(): void;
        /** Resolve any lazy style thunks and adopt the sheets once they load. The
         *  component has already rendered with its synchronous styles by now, so
         *  these arrive late (FOUC) — see `ComponentOptions.styles`. */
        #loadLazyStyles(): void;
        /** Light-DOM children projected into this component's `<slot>` — for render
         *  logic (fallbacks, counts, wrapping). The `<slot>` element projects them
         *  automatically; use this only when you need to branch on the content. */
        slotted(): Element[];
        getAttribute: (<S extends AnyString<string> | PropNames</*elided*/ any>>(qualifiedName: S) => string | null) & ((qualifiedName: string) => string | null);
        /** Like getAttribute, but typed to the prop: a known `@prop` name returns
         *  that prop's value (read off the instance), otherwise the raw attribute. */
        attr<S extends AnyString<string> | PropNames</*elided*/ any>>(name: S): string | (S extends keyof /*elided*/ any ? /*elided*/ any[S] : never) | null;
        disconnectedCallback(): void;
        requestUpdate(priority?: Priority): void;
        /** Render now — called by the scheduler (implements SchedulerHost). */
        flush(): void;
        /** Flush this host's scheduler synchronously (SSR/SSG, tests). */
        flushSync(): void;
        /** Register teardown to run on disconnect / dispose. */
        onCleanup(teardown: () => void): void;
        /**
         * Create an abortable async task bound to this host — sugar for the
         * standalone `task(this, …)`, so you don't have to pass `this`:
         *
         *   load = this.task(async (id, signal) => fetch(`/x/${id}`, { signal }), { priority: "background" });
         *
         * The previous run is aborted when a new one starts and on disconnect; its
         * `pending` / `value` / `error` updates are scheduled at `options.priority`.
         */
        task<A extends unknown[], R>(fn: (...args: [...A, AbortSignal]) => Promise<R>, options?: TaskOptions): Task<A, R, unknown>;
        /** This instance's live scoped stylesheets. Mutate one in place
         *  (`getStyles()[0].replaceSync(…)`) to restyle at runtime — note `css`
         *  sheets shared across components are shared state. Prefer `setStyles()`
         *  for a clean per-instance swap. */
        getStyles(): CSSStyleSheet[];
        /** Replace this instance's scoped styles at runtime (per-instance — does
         *  not touch sheets shared via `static styles` / Component options).
         *  No-op in light-DOM mode (no scoping target). */
        setStyles(input: StyleInput | StyleInput[]): void;
        /**
         * Game-loop tick (dt in ms) on this host's scheduler — runs every frame,
         * even with no reactive change; state set inside renders the same frame.
         * Auto-stops on disconnect. Use a frame scheduler (`static scheduler =
         * createFpsScheduler(n)`); otherwise falls back to the rAF scheduler.
         */
        onFrame(callback: (dt: number) => void): () => void;
        /** (Re)subscribe a game-loop tick on the CURRENT scheduler, tracking its
         *  unsubscribe so a later scheduler swap can move it. */
        #subscribeFrame(callback: (dt: number) => void): void;
        /** addEventListener that auto-unsubscribes on disconnect. */
        listen<T extends EventTarget>(target: T, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
        /** Dispatch a CustomEvent (Angular @Output / Vue emit). Bubbling + composed
         *  by default so a parent's `@type=${fn}` (even across a shadow boundary)
         *  catches it; `flags` overrides those for one dispatch. */
        emit<T = unknown>(type: string, detail?: T | undefined, flags?: {
            bubbles?: boolean;
            composed?: boolean;
            cancelable?: boolean;
        } | undefined): void;
        #upgradeProp(name: string): void;
        /** Write a prop value to an attribute: booleans toggle presence, others stringify. */
        #writeAttr(attr: string, value: unknown): void;
        #render(): void;
        /** Route a caught error to this component's `onError` boundary (once per
         *  failed render cycle), else to the global handler. */
        #handleError(error: unknown, phase: ErrorPhase): void;
        #renderInner(): void;
        render(): TemplateResult | Node;
        /** Explicit disposal (TC39 `using`) — same teardown as disconnect. */
        [Symbol.dispose](): void;
        accessKey: string;
        readonly accessKeyLabel: string;
        autocapitalize: string;
        autocorrect: boolean;
        dir: string;
        draggable: boolean;
        hidden: boolean;
        inert: boolean;
        innerText: string;
        lang: string;
        readonly offsetHeight: number;
        readonly offsetLeft: number;
        readonly offsetParent: Element | null;
        readonly offsetTop: number;
        readonly offsetWidth: number;
        outerText: string;
        popover: string | null;
        spellcheck: boolean;
        title: string;
        translate: boolean;
        writingSuggestions: string;
        attachInternals(): ElementInternals;
        click(): void;
        hidePopover(): void;
        showPopover(): void;
        togglePopover(options?: boolean): boolean;
        addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
        removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
        readonly attributes: NamedNodeMap;
        get classList(): DOMTokenList;
        set classList(value: string);
        className: string;
        readonly clientHeight: number;
        readonly clientLeft: number;
        readonly clientTop: number;
        readonly clientWidth: number;
        readonly currentCSSZoom: number;
        id: string;
        innerHTML: string;
        readonly localName: string;
        readonly namespaceURI: string | null;
        onfullscreenchange: ((this: Element, ev: Event) => any) | null;
        onfullscreenerror: ((this: Element, ev: Event) => any) | null;
        outerHTML: string;
        readonly ownerDocument: Document;
        get part(): DOMTokenList;
        set part(value: string);
        readonly prefix: string | null;
        readonly scrollHeight: number;
        scrollLeft: number;
        scrollTop: number;
        readonly scrollWidth: number;
        readonly shadowRoot: ShadowRoot | null;
        slot: string;
        readonly tagName: string;
        attachShadow(init: ShadowRootInit): ShadowRoot;
        checkVisibility(options?: CheckVisibilityOptions): boolean;
        closest<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K] | null;
        closest<K extends keyof SVGElementTagNameMap>(selector: K): SVGElementTagNameMap[K] | null;
        closest<K extends keyof MathMLElementTagNameMap>(selector: K): MathMLElementTagNameMap[K] | null;
        closest<E extends Element = Element>(selectors: string): E | null;
        computedStyleMap(): StylePropertyMapReadOnly;
        getAttributeNS(namespace: string | null, localName: string): string | null;
        getAttributeNames(): string[];
        getAttributeNode(qualifiedName: string): Attr | null;
        getAttributeNodeNS(namespace: string | null, localName: string): Attr | null;
        getBoundingClientRect(): DOMRect;
        getClientRects(): DOMRectList;
        getElementsByClassName(classNames: string): HTMLCollectionOf<Element>;
        getElementsByTagName<K extends keyof HTMLElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<HTMLElementTagNameMap[K]>;
        getElementsByTagName<K extends keyof SVGElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<SVGElementTagNameMap[K]>;
        getElementsByTagName<K extends keyof MathMLElementTagNameMap>(qualifiedName: K): HTMLCollectionOf<MathMLElementTagNameMap[K]>;
        getElementsByTagName<K extends keyof HTMLElementDeprecatedTagNameMap>(qualifiedName: K): HTMLCollectionOf<HTMLElementDeprecatedTagNameMap[K]>;
        getElementsByTagName(qualifiedName: string): HTMLCollectionOf<Element>;
        getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1999/xhtml", localName: string): HTMLCollectionOf<HTMLElement>;
        getElementsByTagNameNS(namespaceURI: "http://www.w3.org/2000/svg", localName: string): HTMLCollectionOf<SVGElement>;
        getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1998/Math/MathML", localName: string): HTMLCollectionOf<MathMLElement>;
        getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollectionOf<Element>;
        getHTML(options?: GetHTMLOptions): string;
        hasAttribute(qualifiedName: string): boolean;
        hasAttributeNS(namespace: string | null, localName: string): boolean;
        hasAttributes(): boolean;
        hasPointerCapture(pointerId: number): boolean;
        insertAdjacentElement(where: InsertPosition, element: Element): Element | null;
        insertAdjacentHTML(position: InsertPosition, string: string): void;
        insertAdjacentText(where: InsertPosition, data: string): void;
        matches(selectors: string): boolean;
        releasePointerCapture(pointerId: number): void;
        removeAttribute(qualifiedName: string): void;
        removeAttributeNS(namespace: string | null, localName: string): void;
        removeAttributeNode(attr: Attr): Attr;
        requestFullscreen(options?: FullscreenOptions): Promise<void>;
        requestPointerLock(options?: PointerLockOptions): Promise<void>;
        scroll(options?: ScrollToOptions): void;
        scroll(x: number, y: number): void;
        scrollBy(options?: ScrollToOptions): void;
        scrollBy(x: number, y: number): void;
        scrollIntoView(arg?: boolean | ScrollIntoViewOptions): void;
        scrollTo(options?: ScrollToOptions): void;
        scrollTo(x: number, y: number): void;
        setAttribute(qualifiedName: string, value: string): void;
        setAttributeNS(namespace: string | null, qualifiedName: string, value: string): void;
        setAttributeNode(attr: Attr): Attr | null;
        setAttributeNodeNS(attr: Attr): Attr | null;
        setHTMLUnsafe(html: string): void;
        setPointerCapture(pointerId: number): void;
        toggleAttribute(qualifiedName: string, force?: boolean): boolean;
        webkitMatchesSelector(selectors: string): boolean;
        get textContent(): string;
        set textContent(value: string | null);
        readonly baseURI: string;
        readonly childNodes: NodeListOf<ChildNode>;
        readonly firstChild: ChildNode | null;
        readonly isConnected: boolean;
        readonly lastChild: ChildNode | null;
        readonly nextSibling: ChildNode | null;
        readonly nodeName: string;
        readonly nodeType: number;
        nodeValue: string | null;
        readonly parentElement: HTMLElement | null;
        readonly parentNode: ParentNode | null;
        readonly previousSibling: ChildNode | null;
        appendChild<T extends Node>(node: T): T;
        cloneNode(subtree?: boolean): Node;
        compareDocumentPosition(other: Node): number;
        contains(other: Node | null): boolean;
        getRootNode(options?: GetRootNodeOptions): Node;
        hasChildNodes(): boolean;
        insertBefore<T extends Node>(node: T, child: Node | null): T;
        isDefaultNamespace(namespace: string | null): boolean;
        isEqualNode(otherNode: Node | null): boolean;
        isSameNode(otherNode: Node | null): boolean;
        lookupNamespaceURI(prefix: string | null): string | null;
        lookupPrefix(namespace: string | null): string | null;
        normalize(): void;
        removeChild<T extends Node>(child: T): T;
        replaceChild<T extends Node>(node: Node, child: T): T;
        readonly ELEMENT_NODE: 1;
        readonly ATTRIBUTE_NODE: 2;
        readonly TEXT_NODE: 3;
        readonly CDATA_SECTION_NODE: 4;
        readonly ENTITY_REFERENCE_NODE: 5;
        readonly ENTITY_NODE: 6;
        readonly PROCESSING_INSTRUCTION_NODE: 7;
        readonly COMMENT_NODE: 8;
        readonly DOCUMENT_NODE: 9;
        readonly DOCUMENT_TYPE_NODE: 10;
        readonly DOCUMENT_FRAGMENT_NODE: 11;
        readonly NOTATION_NODE: 12;
        readonly DOCUMENT_POSITION_DISCONNECTED: 1;
        readonly DOCUMENT_POSITION_PRECEDING: 2;
        readonly DOCUMENT_POSITION_FOLLOWING: 4;
        readonly DOCUMENT_POSITION_CONTAINS: 8;
        readonly DOCUMENT_POSITION_CONTAINED_BY: 16;
        readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32;
        dispatchEvent(event: Event): boolean;
        ariaActiveDescendantElement: Element | null;
        ariaAtomic: string | null;
        ariaAutoComplete: string | null;
        ariaBrailleLabel: string | null;
        ariaBrailleRoleDescription: string | null;
        ariaBusy: string | null;
        ariaChecked: string | null;
        ariaColCount: string | null;
        ariaColIndex: string | null;
        ariaColIndexText: string | null;
        ariaColSpan: string | null;
        ariaControlsElements: ReadonlyArray<Element> | null;
        ariaCurrent: string | null;
        ariaDescribedByElements: ReadonlyArray<Element> | null;
        ariaDescription: string | null;
        ariaDetailsElements: ReadonlyArray<Element> | null;
        ariaDisabled: string | null;
        ariaErrorMessageElements: ReadonlyArray<Element> | null;
        ariaExpanded: string | null;
        ariaFlowToElements: ReadonlyArray<Element> | null;
        ariaHasPopup: string | null;
        ariaHidden: string | null;
        ariaInvalid: string | null;
        ariaKeyShortcuts: string | null;
        ariaLabel: string | null;
        ariaLabelledByElements: ReadonlyArray<Element> | null;
        ariaLevel: string | null;
        ariaLive: string | null;
        ariaModal: string | null;
        ariaMultiLine: string | null;
        ariaMultiSelectable: string | null;
        ariaOrientation: string | null;
        ariaOwnsElements: ReadonlyArray<Element> | null;
        ariaPlaceholder: string | null;
        ariaPosInSet: string | null;
        ariaPressed: string | null;
        ariaReadOnly: string | null;
        ariaRelevant: string | null;
        ariaRequired: string | null;
        ariaRoleDescription: string | null;
        ariaRowCount: string | null;
        ariaRowIndex: string | null;
        ariaRowIndexText: string | null;
        ariaRowSpan: string | null;
        ariaSelected: string | null;
        ariaSetSize: string | null;
        ariaSort: string | null;
        ariaValueMax: string | null;
        ariaValueMin: string | null;
        ariaValueNow: string | null;
        ariaValueText: string | null;
        role: string | null;
        animate(keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions): Animation;
        getAnimations(options?: GetAnimationsOptions): Animation[];
        after(...nodes: (Node | string)[]): void;
        before(...nodes: (Node | string)[]): void;
        remove(): void;
        replaceWith(...nodes: (Node | string)[]): void;
        readonly nextElementSibling: Element | null;
        readonly previousElementSibling: Element | null;
        readonly childElementCount: number;
        readonly children: HTMLCollection;
        readonly firstElementChild: Element | null;
        readonly lastElementChild: Element | null;
        append(...nodes: (Node | string)[]): void;
        prepend(...nodes: (Node | string)[]): void;
        querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
        querySelector<K extends keyof SVGElementTagNameMap>(selectors: K): SVGElementTagNameMap[K] | null;
        querySelector<K extends keyof MathMLElementTagNameMap>(selectors: K): MathMLElementTagNameMap[K] | null;
        querySelector<K extends keyof HTMLElementDeprecatedTagNameMap>(selectors: K): HTMLElementDeprecatedTagNameMap[K] | null;
        querySelector<E extends Element = Element>(selectors: string): E | null;
        querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeListOf<HTMLElementTagNameMap[K]>;
        querySelectorAll<K extends keyof SVGElementTagNameMap>(selectors: K): NodeListOf<SVGElementTagNameMap[K]>;
        querySelectorAll<K extends keyof MathMLElementTagNameMap>(selectors: K): NodeListOf<MathMLElementTagNameMap[K]>;
        querySelectorAll<K extends keyof HTMLElementDeprecatedTagNameMap>(selectors: K): NodeListOf<HTMLElementDeprecatedTagNameMap[K]>;
        querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
        replaceChildren(...nodes: (Node | string)[]): void;
        readonly assignedSlot: HTMLSlotElement | null;
        readonly attributeStyleMap: StylePropertyMap;
        get style(): CSSStyleDeclaration;
        set style(cssText: string);
        contentEditable: string;
        enterKeyHint: string;
        inputMode: string;
        readonly isContentEditable: boolean;
        onabort: ((this: GlobalEventHandlers, ev: UIEvent) => any) | null;
        onanimationcancel: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onanimationend: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onanimationiteration: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onanimationstart: ((this: GlobalEventHandlers, ev: AnimationEvent) => any) | null;
        onauxclick: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onbeforeinput: ((this: GlobalEventHandlers, ev: InputEvent) => any) | null;
        onbeforematch: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onbeforetoggle: ((this: GlobalEventHandlers, ev: ToggleEvent) => any) | null;
        onblur: ((this: GlobalEventHandlers, ev: FocusEvent) => any) | null;
        oncancel: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncanplay: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncanplaythrough: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onclick: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onclose: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncontextlost: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncontextmenu: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        oncontextrestored: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncopy: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
        oncuechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oncut: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
        ondblclick: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        ondrag: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragend: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragenter: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragleave: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragover: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondragstart: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondrop: ((this: GlobalEventHandlers, ev: DragEvent) => any) | null;
        ondurationchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onemptied: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onended: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onerror: OnErrorEventHandler;
        onfocus: ((this: GlobalEventHandlers, ev: FocusEvent) => any) | null;
        onformdata: ((this: GlobalEventHandlers, ev: FormDataEvent) => any) | null;
        ongotpointercapture: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        oninput: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        oninvalid: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onkeydown: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
        onkeypress: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
        onkeyup: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
        onload: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onloadeddata: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onloadedmetadata: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onloadstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onlostpointercapture: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onmousedown: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseenter: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseleave: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmousemove: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseout: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseover: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onmouseup: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
        onpaste: ((this: GlobalEventHandlers, ev: ClipboardEvent) => any) | null;
        onpause: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onplay: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onplaying: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onpointercancel: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerdown: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerenter: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerleave: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointermove: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerout: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerover: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onpointerrawupdate: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onpointerup: ((this: GlobalEventHandlers, ev: PointerEvent) => any) | null;
        onprogress: ((this: GlobalEventHandlers, ev: ProgressEvent) => any) | null;
        onratechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onreset: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onresize: ((this: GlobalEventHandlers, ev: UIEvent) => any) | null;
        onscroll: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onscrollend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onsecuritypolicyviolation: ((this: GlobalEventHandlers, ev: SecurityPolicyViolationEvent) => any) | null;
        onseeked: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onseeking: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onselect: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onselectionchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onselectstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onslotchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onstalled: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onsubmit: ((this: GlobalEventHandlers, ev: SubmitEvent) => any) | null;
        onsuspend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        ontimeupdate: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        ontoggle: ((this: GlobalEventHandlers, ev: ToggleEvent) => any) | null;
        ontouchcancel?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontouchend?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontouchmove?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontouchstart?: ((this: GlobalEventHandlers, ev: TouchEvent) => any) | null | undefined;
        ontransitioncancel: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        ontransitionend: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        ontransitionrun: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        ontransitionstart: ((this: GlobalEventHandlers, ev: TransitionEvent) => any) | null;
        onvolumechange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwaiting: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkitanimationend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkitanimationiteration: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkitanimationstart: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwebkittransitionend: ((this: GlobalEventHandlers, ev: Event) => any) | null;
        onwheel: ((this: GlobalEventHandlers, ev: WheelEvent) => any) | null;
        autofocus: boolean;
        readonly dataset: DOMStringMap;
        nonce?: string;
        tabIndex: number;
        blur(): void;
        focus(options?: FocusOptions): void;
    } & ProviderContributions<TProviders>;
};
declare namespace Component {
    var prop: typeof propDecorator;
    var event: typeof eventDecorator;
    var watch: typeof watchDecorator;
    var define: typeof defineDecorator;
    var compile: typeof compileDecorator;
    var computed: typeof computedDecorator;
}
interface MountHandle {
    root: Element;
    element: HTMLElement;
    /** Unmount on scope exit (TC39 `using`) — removal disposes the component. */
    [Symbol.dispose](): void;
}
declare function Mount(root: Element | null, Root: ComponentConstructor): MountHandle;
export { Component, Mount, hydrate, getHydrationProps, flushSync };
export type { ReactiveHost, DevtoolsEvent, DevtoolsHook, ListenerInfo, StyleRule, ComponentConstructor, ComponentOptions, DefineWhen, OnMount, OnUpdate, OnUnmount, OnError, MountHandle, };
