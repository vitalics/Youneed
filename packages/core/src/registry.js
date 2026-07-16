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
export function ctorOf(self) {
    return self.constructor;
}
/**
 * Walk a class's constructor chain, most-derived first, stopping before `Object`
 * (and before `stopAt`, when given — e.g. `HTMLElement` for custom elements, so
 * the walk covers only user classes). Yields each constructor in turn.
 *
 *   for (const c of classChain(ctor, HTMLElement)) { ...read c's own metadata... }
 */
export function* classChain(ctor, stopAt) {
    let c = ctor;
    while (c && c !== Object && c !== stopAt) {
        yield c;
        c = Object.getPrototypeOf(c.prototype)?.constructor ?? null;
    }
}
/** Create a {@link Registry}; `create` builds a fresh entry (e.g. `() => []`). */
export function createRegistry(create) {
    const map = new WeakMap();
    return {
        for(ctor) {
            let value = map.get(ctor);
            if (!map.has(ctor))
                map.set(ctor, (value = create()));
            return value;
        },
        read: (ctor) => map.get(ctor),
        has: (ctor) => map.has(ctor),
    };
}
