# @youneed/core — metadata registry, disposal helpers, shared types

Three tiny, zero-dependency pieces every other `@youneed` package builds on. You rarely import
it directly (`dom`/`server`/`ssr`/`test`/`cli` re-export or consume it) — reach for it when
**authoring your own** decorator-driven base class (a `Component`/`Controller`/`Test`-style
factory).

## The class-metadata registry (the core trick)

`Component` (dom), `Controller` (server), `Page` (ssr), `Test`/`Fixture` (test) share one
mechanism: a decorator records *what* a member is into a per-class store from a
`ctx.addInitializer` callback (where `this` is the instance under construction, so its
`.constructor` is the user's most-derived class); the runtime reads it back at construction.
The store is a `WeakMap` keyed by the constructor (GC'd with the class). **This is the
esbuild/tsx-safe alternative to `Symbol.metadata`, which those bundlers never emit.**

```ts
import { createRegistry, ctorOf, classChain } from "@youneed/core";

interface FieldMeta { name: string; prop: string; }
const FIELDS = createRegistry<FieldMeta[]>(() => []);

// A field decorator that records itself into the most-derived class's entry:
function field(name: string) {
  return function (_v: unknown, ctx: ClassFieldDecoratorContext) {
    ctx.addInitializer(function (this: object) {
      FIELDS.for(ctorOf(this)).push({ name, prop: String(ctx.name) });
    });
  };
}

// The runtime reads it back, walking the inheritance chain most-derived first:
function fieldsOf(instance: object): FieldMeta[] {
  const all: FieldMeta[] = [];
  for (const c of classChain(ctorOf(instance))) all.push(...(FIELDS.read(c) ?? []));
  return all;
}
```

- **`createRegistry<T>(create)` → `Registry<T>`** — `for(ctor)` lazily creates the entry
  (decorators write into it), `read(ctor)` returns it without creating one (runtime reads it
  back), `has(ctor)`.
- **`ctorOf(self)`** — the constructor of `this`, for use inside an `addInitializer` callback
  (the user's concrete subclass).
- **`classChain(ctor, stopAt?)`** — generator over the constructor chain, most-derived first,
  stopping before `Object` (and before `stopAt`, e.g. `HTMLElement` for custom elements, so the
  walk covers only user classes).

## Disposal helpers

Turn a plain cleanup function into a disposable and call disposers uniformly (sync or async).
Originated in `@youneed/test` fixture teardown; also underpins server resource cleanup.

```ts
import { dispose, isDisposable, disposeValue } from "@youneed/core";

const conn = dispose(openConnection(), async () => closeConnection());   // attach disposer to a value
{
  await using c = conn;                 // closed on scope exit
}
await disposeValue(conn);               // or call manually (no-op if the value carries none)
```
- `dispose(cleanup)` → a bare `Disposable`/`AsyncDisposable`; `dispose(value, cleanup)` attaches
  the disposer to `value` and returns it.
- An **async** cleanup gets `[Symbol.asyncDispose]`, a **sync** one `[Symbol.dispose]` — so both
  `using` and `await using` work.
- `isDisposable(v)` tests for either disposer; `disposeValue(v)` awaits whichever is present.

## Shared types

`MaybePromise<T>`, `Constructor<T>`, `AbstractConstructor<T>`, `AnyConstructor<T>` — the single
definitions the other packages key class-level metadata by (previously re-declared in dom /
server / test).
