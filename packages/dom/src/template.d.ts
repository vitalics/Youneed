import { TASK_BRAND } from "./task.ts";
interface TemplateResult {
    readonly strings: TemplateStringsArray;
    readonly values: unknown[];
}
declare function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;
type PartKind = "node" | "attr" | "attr-multi" | "event" | "property" | "element";
interface PartMeta {
    kind: PartKind;
    path: number[];
    holeIndex: number;
    name?: string;
    strings?: string[];
    holeIndices?: number[];
}
interface CompiledTemplate {
    content: DocumentFragment;
    metas: PartMeta[];
}
declare function compileTemplate(strings: TemplateStringsArray): CompiledTemplate;
interface Part {
    readonly holeIndex: number;
    commit(value: unknown): void;
}
/** Slot content for `View.of(props, slot)` — projected into a `<slot>`. */
type SlotContent = TemplateResult | string;
/** Append slot content into a host's LIGHT DOM (so a shadow `<slot>` projects it). */
declare function appendSlot(host: Element, content: SlotContent): void;
/** A keyed list, produced by `repeat()`. A NodePart reconciles it by key:
 *  unchanged items keep their DOM (and listeners/state); the list only touches
 *  the DOM when items are added, removed or reordered. */
interface RepeatResult {
    readonly __repeat: true;
    readonly keys: unknown[];
    readonly templates: TemplateResult[];
}
/**
 * Keyed list rendering (Lit's `repeat`). `keyFn` gives each item a stable
 * identity so re-renders reuse existing DOM instead of recreating it.
 *
 *   html`<ul>${repeat(users, (u) => u.id, (u) => html`<li>${u.name}</li>`)}</ul>`
 */
declare function repeat<T>(items: Iterable<T>, keyFn: (item: T, index: number) => unknown, template: (item: T, index: number) => TemplateResult): RepeatResult;
/** Build a class string from a map: keys with a truthy value are included.
 *    class=${classMap({ btn: true, active: isActive })}  ->  "btn active" */
declare function classMap(map: Record<string, unknown>): string;
/** Build a style string from a map (camelCase → kebab-case; null/undefined/false
 *  are skipped; `--vars` pass through):
 *    style=${styleMap({ color, minWidth: w && `${w}px` })} */
declare function styleMap(map: Record<string, string | number | null | undefined | false>): string;
/** Conditional render. Lazy — only the taken branch runs:
 *    ${when(loading, () => html`<spinner/>`, () => html`<content/>`)} */
declare function when<T>(condition: unknown, then: () => T, otherwise?: () => T): T | "";
/** Map an iterable to template results (non-keyed; use `repeat` for keyed lists):
 *    ${map(items, (it, i) => html`<li>${i}: ${it.name}</li>`)} */
declare function map<T>(items: Iterable<T> | null | undefined, fn: (item: T, index: number) => unknown): unknown[];
/** Single-condition render — the if/else statement of a template. Lazy: only the
 *  taken branch runs. Use it instead of a `?:` ternary for readability:
 *    ${If(this.loading, () => html`<spinner/>`, () => html`<main/>`)} */
declare function If<T>(condition: unknown, then: () => T, otherwise?: () => T): T | "";
/** Multi-way render — the switch statement of a template. Matches `value` against
 *  the `cases` keys, falling back to `default` (or `""` if absent). Lazy: only the
 *  matched branch runs, so you avoid a chain of nested ternaries:
 *    ${Switch(this.status, {
 *       loading: () => html`<spinner/>`,
 *       error:   () => html`<error-banner .msg=${this.err}></error-banner>`,
 *       default: () => html`<main>${this.data}</main>`,
 *    })} */
declare function Switch<K extends PropertyKey, T>(value: K, cases: Partial<Record<K, () => T>> & {
    default?: () => T;
}): T | "";
/** Render a numeric range — the for-loop of a template. Produces one result per
 *  step from `start` (inclusive) toward `end` (exclusive), like a C-style
 *  `for (i = start; i < end; i += step)`. `step` defaults to 1; a negative step
 *  counts down. Use it when you need indices, not an existing array (that's `map`):
 *    ${For(1, 5, (i) => html`<span>${i}</span>`)}        // 1 2 3 4
 *    ${For(0, 10, 2, (i) => html`<col data-i=${i}/>`)}    // 0 2 4 6 8 */
declare function For<T>(start: number, end: number, produce: (index: number) => T): T[];
declare function For<T>(start: number, end: number, step: number, produce: (index: number) => T): T[];
/** Render while a predicate holds — the while-loop of a template. Calls `produce`
 *  for index 0, 1, 2, … as long as `condition(index)` is truthy, collecting the
 *  results. Guarded against a runaway loop (throws past 1e6 iterations) so a bad
 *  predicate surfaces as an error instead of hanging the render:
 *    ${While((i) => i < this.pageCount, (i) => html`<a>${i + 1}</a>`)} */
declare function While<T>(condition: (index: number) => unknown, produce: (index: number) => T): T[];
/** `flow` groups the control-flow helpers under their natural keyword names —
 *  `flow.if`, `flow.switch`, `flow.while`, `flow.for` work because reserved words
 *  are legal as *property* names (a bare `if(...)` call is not). `flow.when` and
 *  `flow.map` are the same functions as the top-level exports, grouped here for
 *  discoverability and a single import:
 *    import { flow } from "@youneed/dom";
 *    ${flow.if(this.open, () => html`<panel/>`)}
 *    ${flow.for(0, this.cols, (i) => html`<col data-i=${i}/>`)} */
declare const flow: {
    when: typeof when;
    map: typeof map;
    if: typeof If;
    switch: typeof Switch;
    while: typeof While;
    for: typeof For;
    await: typeof Await;
};
/** A mutable handle to an element, filled by the `ref` directive. */
interface Ref<E extends Element = Element> {
    value: E | null;
}
type RefTarget<E extends Element = Element> = ((el: E | null) => void) | Ref<E>;
interface RefDirective {
    readonly __ref: RefTarget;
}
/** Create an empty ref handle: `#input = createRef<HTMLInputElement>()`. */
declare function createRef<E extends Element = Element>(): Ref<E>;
/** Element directive — capture the element into a ref handle or callback:
 *    <input ${ref(this.#input)}>          // this.#input.value === the <input>
 *    <canvas ${ref((el) => …)}>           // callback (el | null on teardown) */
declare function ref<E extends Element = Element>(target: RefTarget<E>): RefDirective;
interface PortalResult {
    readonly __portal: true;
    readonly target: Element;
    readonly content: unknown;
}
/** Render `content` into `target` (e.g. `document.body`) instead of inline — for
 *  dialogs/popovers that must escape overflow/transform/stacking of ancestors.
 *  The content is removed when the directive is cleared or the host unmounts.
 *    ${portal(document.body, when(this.open, () => html`<div class="modal">…</div>`))} */
declare function portal(target: Element, content: unknown): PortalResult;
/** Branches for the three states of an awaited value. Each is lazy — only the
 *  state's own branch runs. `then`/`catch` get the resolved value / rejection. */
interface AwaitHandlers<T = unknown, R = unknown> {
    /** Resolved — receives the awaited value. */
    then?: (value: T) => R;
    /** Not settled yet — the loading state. */
    pending?: () => R;
    /** Rejected — receives the error. */
    catch?: (error: unknown) => R;
}
interface AwaitResult {
    readonly __await: true;
    readonly input: unknown;
    readonly handlers: AwaitHandlers;
}
/** Type-level guard: a `Task` (and the promise from `task.run()`) carries the
 *  `TASK_BRAND`. A task drives its own re-renders, so awaiting it in `render()`
 *  loops forever — reject it at the call site with a readable message. A plain
 *  `Promise` has no required brand, so it stays assignable. */
type RejectTask<T> = T extends {
    readonly [TASK_BRAND]: unknown;
} ? {
    readonly ["✗ flow.await does not accept a Task or task.run() — a task re-renders on its own, so awaiting it loops. Read task.pending/value/error instead, or await a plain stored promise."]: never;
} : unknown;
/** Render a promise's settled state inline — the `await` of a template (capitalised
 *  because `await` is a reserved word). Shows `pending()` until the promise settles,
 *  then `then(value)` or `catch(error)`. When it settles it patches its OWN slot in
 *  place — it does NOT trigger a host re-render — so an inline `fetch(...)` isn't
 *  recreated in a loop. Re-subscribes only when the awaited value's identity
 *  changes (pass a stored promise / a task's run() for a stable identity):
 * @example
 *    ${Await(fetch(url, { signal: this.abortSignal }).then((r) => r.json()), {
 *       pending: () => html`<spinner/>`,
 *       then: (data) => html`<view .data=${data}></view>`,
 *       catch: (e) => html`<error-banner .msg=${String(e)}></error-banner>`,
 *    })} */
declare function Await<T, R = unknown>(input: T & RejectTask<T>, handlers: AwaitHandlers<Awaited<T>, R>): AwaitResult;
declare class EventPart implements Part {
    #private;
    readonly el: Element;
    readonly name: string;
    readonly holeIndex: number;
    constructor(el: Element, name: string, holeIndex: number);
    commit(value: unknown): void;
}
declare const externalProps: WeakMap<Element, Map<string, unknown>>;
declare function bindParts(frag: DocumentFragment, metas: PartMeta[]): Part[];
declare function css(strings: TemplateStringsArray, ...values: unknown[]): CSSStyleSheet;
/** A stylesheet, or raw CSS text (e.g. from a `?raw` file import / fetch). */
type StyleInput = CSSStyleSheet | string;
/** A lazily-loaded stylesheet: a thunk returning a promise (typically a dynamic
 *  `import("./x.css")`) that resolves to a CSS string, a CSSStyleSheet, or a
 *  module whose `default` is one of those. Resolved per-instance on connect and
 *  adopted when ready — so the component renders BEFORE the styles arrive (FOUC).
 *  Not the preferred path; see `ComponentOptions.styles`. */
type LazyStyle = () => Promise<unknown>;
type StyleEntry = CSSStyleSheet | LazyStyle;
/** Coerce a `StyleInput` (or list) to CSSStyleSheets. Raw strings — typically
 *  the contents of a `.css` file imported as text — become a stylesheet. */
declare function toStyleSheets(input: StyleInput | StyleInput[]): CSSStyleSheet[];
/** Convert option styles to their stored form: strings → sheets, sheets and
 *  lazy thunks kept as-is. The thunks are resolved per-instance on connect. */
declare function normalizeStyles(input: StyleInput | LazyStyle | Array<StyleInput | LazyStyle>): StyleEntry[];
declare function getStyles(ctor: Function): CSSStyleSheet[];
/** Lazy style thunks declared anywhere on the class chain's `static styles`. */
declare function getLazyStyles(ctor: Function): LazyStyle[];
declare function loadLazySheet(thunk: LazyStyle): Promise<CSSStyleSheet>;
/** Set/read the host whose render is in progress, so portal/ref directives can
 *  tie their cleanup to it. Component's #render brackets a render with these. */
export declare function setCurrentHost(host: {
    onCleanup(teardown: () => void): void;
} | undefined): void;
export declare function getCurrentHost(): {
    onCleanup(teardown: () => void): void;
} | undefined;
export { html, css, repeat, classMap, styleMap, when, map, If, Switch, For, While, Await, flow, ref, createRef, portal, compileTemplate, bindParts, appendSlot, getStyles, getLazyStyles, loadLazySheet, normalizeStyles, toStyleSheets, externalProps, EventPart, };
export type { TemplateResult, RepeatResult, Ref, RefDirective, PortalResult, AwaitResult, AwaitHandlers, StyleInput, LazyStyle, Part, SlotContent, StyleEntry, };
