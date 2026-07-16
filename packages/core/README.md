# @youneed/core

Foundational primitives shared across the `@youneed/*` packages. Three tiny,
zero-dependency pieces that every other framework in the monorepo builds on:

1. **Shared types** — common type aliases that were independently re-declared in
   `@youneed/dom`, `@youneed/server` and `@youneed/test`.
2. **The class-metadata registry** — the decorator pattern every `@youneed`
   framework is built on, and the reason they all work under **esbuild/tsx**
   (where `Symbol.metadata` is never emitted).
3. **Disposal helpers** — bridge plain cleanup functions to JS `using` /
   `await using` and the TC39 explicit-resource-management protocol.

You rarely import this directly — `@youneed/dom`, `-server`, `-ssr`, `-test`,
`-cli` re-export or consume it. Reach for it when **authoring your own**
decorator-driven base class (a `Component`/`Controller`/`Test`-style factory).

## Install

```bash
pnpm add @youneed/core
```

## The class-metadata registry

`Component` (dom), `Controller` (server), `Page` (ssr) and `Test`/`Fixture`
(test) all share one mechanism: a TC39 decorator records *what* a member is into
a per-class store, and the runtime reads it back at construction. The store is a
`WeakMap` keyed by the class constructor (garbage-collected with the class) and
is populated from a decorator's `ctx.addInitializer` callback — where `this` is
the instance being constructed, so its `.constructor` is the user's most-derived
class. This is the **esbuild/tsx-safe** alternative to decorator metadata.

```ts
import { createRegistry, ctorOf, classChain } from "@youneed/core";

interface FieldMeta { name: string; prop: string; }
const FIELDS = createRegistry<FieldMeta[]>(() => []);

// A field decorator that records itself into the most-derived class's entry.
function field(name: string) {
  return function (_v: unknown, ctx: ClassFieldDecoratorContext) {
    ctx.addInitializer(function (this: object) {
      FIELDS.for(ctorOf(this)).push({ name, prop: String(ctx.name) });
    });
  };
}

// The runtime reads it back, walking the inheritance chain most-derived first.
function fieldsOf(instance: object): FieldMeta[] {
  const all: FieldMeta[] = [];
  for (const c of classChain(ctorOf(instance))) all.push(...(FIELDS.read(c) ?? []));
  return all;
}
```

- **`createRegistry<T>(create)` → `Registry<T>`** — `for(ctor)` lazily creates
  the entry (decorators write into it), `read(ctor)` returns it without creating
  one (the runtime reads it back), `has(ctor)`.
- **`ctorOf(self)`** — the constructor of `this`, for use inside an
  `addInitializer` callback (the user's concrete subclass).
- **`classChain(ctor, stopAt?)`** — generator over the constructor chain,
  most-derived first, stopping before `Object` (and before `stopAt`, e.g.
  `HTMLElement` for custom elements, so the walk covers only user classes).

## Disposal helpers

Turn a plain cleanup function into a disposable, and call disposers uniformly —
sync or async. Originated in `@youneed/test` fixture teardown.

```ts
import { dispose, isDisposable, disposeValue } from "@youneed/core";

// Make a value disposable in place (e.g. returned from a setup function):
const conn = dispose(openConnection(), async () => closeConnection());
{
  await using c = conn; // closed on scope exit
}

// Or call a disposer manually (no-op if the value carries none):
await disposeValue(conn);
```

`dispose(cleanup)` returns a bare `Disposable`/`AsyncDisposable`; `dispose(value,
cleanup)` attaches the disposer to `value` and returns it. An **async** cleanup
gets `[Symbol.asyncDispose]`, a sync one `[Symbol.dispose]` — so both `using`
and `await using` work. `isDisposable(v)` tests for either disposer;
`disposeValue(v)` awaits whichever is present.

## Shared types

`MaybePromise<T>`, `Constructor<T>`, `AbstractConstructor<T>`,
`AnyConstructor<T>` — the one definition the other packages key class-level
metadata by.
