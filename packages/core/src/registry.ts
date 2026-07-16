// The class-metadata registry — the pattern every @youneed framework is built on.
//
// @youneed/dom (Component), @youneed/server (Controller), @youneed/ssr (Page) and
// @youneed/test (Test/Fixture/Reporter) all share the same mechanism: a TC39
// decorator records *what* a member is into a per-class store, and the runtime
// reads it back at construction/mount. The store is keyed by the class
// constructor in a WeakMap (so it's garbage-collected with the class), and is
// populated from a decorator's `ctx.addInitializer` callback — where `this` is
// the instance under construction, so its `.constructor` is the user's
// most-derived class. This works under esbuild/tsx, where `Symbol.metadata` is
// never emitted (so decorator-metadata-based approaches silently do nothing).

/**
 * The constructor of `this`, for use inside a TC39 `addInitializer` callback.
 * `this` there is the instance being constructed, so `.constructor` is the
 * user's concrete subclass — exactly the key class metadata is stored under.
 */
export function ctorOf(self: unknown): Function {
  return (self as { constructor: Function }).constructor;
}

/**
 * Walk a class's constructor chain, most-derived first, stopping before `Object`
 * (and before `stopAt`, when given — e.g. `HTMLElement` for custom elements, so
 * the walk covers only user classes). Yields each constructor in turn.
 *
 *   for (const c of classChain(ctor, HTMLElement)) { ...read c's own metadata... }
 */
export function* classChain(ctor: Function, stopAt?: Function): Generator<Function> {
  let c: Function | null = ctor;
  while (c && c !== Object && c !== stopAt) {
    yield c;
    c = Object.getPrototypeOf((c as { prototype: object }).prototype)?.constructor ?? null;
  }
}

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
export function createRegistry<T>(create: () => T): Registry<T> {
  const map = new WeakMap<Function, T>();
  return {
    for(ctor: Function): T {
      let value = map.get(ctor);
      if (!map.has(ctor)) map.set(ctor, (value = create()));
      return value as T;
    },
    read: (ctor: Function): T | undefined => map.get(ctor),
    has: (ctor: Function): boolean => map.has(ctor),
  };
}
