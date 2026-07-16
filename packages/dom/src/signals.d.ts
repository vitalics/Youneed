/** Equality used to skip no-op writes / recomputes (default `Object.is`). */
interface SignalOptions<T> {
    equals?: (a: T, b: T) => boolean;
}
/** A readable reactive value. Call it (`s()`) or read `s.value` to subscribe
 *  the active `computed`/`effect`; `s.peek()` reads without subscribing. */
interface ReadonlySignal<T> {
    (): T;
    readonly value: T;
    /** Read the current value WITHOUT subscribing the active consumer. */
    peek(): T;
    /** Run `fn` now with the current value, then on every change. Returns an
     *  unsubscribe. */
    subscribe(fn: (value: T) => void): () => void;
}
/** A writable reactive value. Write via `s.value = x`, `s.set(x)` or
 *  `s.update(prev => …)`. */
interface Signal<T> extends ReadonlySignal<T> {
    value: T;
    set(value: T): void;
    update(updater: (prev: T) => T): void;
    /** A read-only view of this signal (hides the setters from consumers). */
    asReadonly(): ReadonlySignal<T>;
}
/**
 * Batch multiple writes so dependent effects run ONCE, after `fn` returns.
 * Without it, three writes to three signals re-run a shared effect three times.
 */
declare function batch<T>(fn: () => T): T;
/**
 * Create a standalone writable signal. For component state prefer
 * `this.signal()` (auto re-render + disposal); use this for store/module-level
 * reactive state shared across components.
 */
declare function createSignal<T>(initial: T, options?: SignalOptions<T>): Signal<T>;
/**
 * Create a memoized derived signal. It recomputes lazily — only when read after
 * one of the signals it last read has changed — and re-subscribes its own
 * consumers transitively.
 */
declare function createComputed<T>(compute: () => T, options?: SignalOptions<T>): ReadonlySignal<T>;
/**
 * Run `fn`, tracking every signal it reads, then re-run it whenever any of them
 * changes. `fn` may return a cleanup that runs before each re-run and on
 * disposal. Returns a disposer that stops the effect. Standalone effects are
 * NOT auto-stopped — store the disposer (or use `this.effect()` on a host).
 */
declare function createEffect(fn: () => void | (() => void)): () => void;
export { batch, createSignal, createSignal as signal, createComputed, createComputed as computed, createEffect, createEffect as effect };
export type { Signal, ReadonlySignal, SignalOptions };
