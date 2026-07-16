/**
 * The constructor of `this`, for use inside a TC39 `addInitializer` callback.
 * `this` there is the instance being constructed, so `.constructor` is the
 * user's concrete subclass — exactly the key class metadata is stored under.
 */
export declare function ctorOf(self: unknown): Function;
/**
 * Walk a class's constructor chain, most-derived first, stopping before `Object`
 * (and before `stopAt`, when given — e.g. `HTMLElement` for custom elements, so
 * the walk covers only user classes). Yields each constructor in turn.
 *
 *   for (const c of classChain(ctor, HTMLElement)) { ...read c's own metadata... }
 */
export declare function classChain(ctor: Function, stopAt?: Function): Generator<Function>;
/**
 * A per-class metadata store keyed by constructor. `for(ctor)` lazily creates
 * the entry (decorators write into it); `read(ctor)` returns it without creating
 * one (the runtime reads it back). Backed by a `WeakMap`, so entries are
 * collected together with their class.
 */
export interface Registry<T> {
    /** The entry for `ctor`, created via the factory on first access. */
    for(ctor: Function): T;
    /** The entry for `ctor`, or `undefined` if none has been created. */
    read(ctor: Function): T | undefined;
    /** Whether `ctor` has an entry. */
    has(ctor: Function): boolean;
}
/** Create a {@link Registry}; `create` builds a fresh entry (e.g. `() => []`). */
export declare function createRegistry<T>(create: () => T): Registry<T>;
