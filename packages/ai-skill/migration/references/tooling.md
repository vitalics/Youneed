# Build & runtime switch — tsconfig, decorators, bundler, runtime, interop, codegen

**Do this first.** Everything else in the migration depends on youneed's TC39-decorator
build compiling alongside (or replacing) the source app's build. Legacy and TC39 decorators
**cannot compile in the same pass** — this is the #1 migration blocker.

## tsconfig — the required shape

```jsonc
{
  "compilerOptions": {
    "experimentalDecorators": false,   // TC39 Stage-3, NOT legacy
    "useDefineForClassFields": false,  // decorators run before field init
    "target": "ES2022",                // or later
    "module": "ESNext",
    "moduleResolution": "Bundler"      // or NodeNext
  }
}
```

- **Decorators go on real initialized fields**, never `declare` fields.
- **`Symbol.metadata` is NOT populated** by esbuild / tsx / Vite. youneed collects metadata
  via `addInitializer` + a `WeakMap` — never read `Symbol.metadata` at runtime, and don't
  assume a bundler fills it.

## Migrating off legacy decorators (Angular / Nest / old TypeORM)

The source likely has `experimentalDecorators: true`. You can't flip it globally while old
code still uses legacy decorators. Options:

- **Scope the compiler per area.** Give the legacy code and the youneed code separate
  tsconfig/plugin scopes. `examples/vite` runs `@analogjs/vite-plugin-angular` with a scoped
  `include` beside the youneed dom plugin — legacy Angular and TC39 youneed compile in
  separate passes in one project.
- **Migrate the leaf, then its build.** Move a unit to TC39 decorators, carve it into the
  youneed-scoped build, delete the legacy version. Strangler at the build level too.
- **Don't half-convert a file.** A single file is all-legacy or all-TC39 — the decorator
  semantics differ (field init order, metadata), so mixing breaks silently.

## Bundler / dev server

- **Vite** — youneed dom compiles fine; see `examples/vite`. Watch decorator settings in
  `esbuild` options (Vite's transform) — esbuild won't emit `Symbol.metadata`, which is why
  youneed uses the `addInitializer`+`WeakMap` pattern.
- **esbuild / tsx** — same caveat: metadata isn't emitted; the framework handles it, but any
  of your own decorators must not depend on `Symbol.metadata`.
- **Node-side DOM (SSR / tests)** — call `registerDOM()` from `@youneed/dom/register`
  **before** importing components; never use `GlobalRegistrator` directly.

## Runtime switch (Bun / Deno → Node)

@youneed/server targets **Node HTTP**. Porting from Bun/Deno means replacing runtime APIs:

| Bun / Deno | Node / youneed |
|------------|----------------|
| `Bun.serve` / `Deno.serve` | `@youneed/server` app + `app.listen(...)` |
| `Bun.file` / `Deno.readFile` | `node:fs` / `return File(path)` |
| `Bun.password` | `node:crypto` `scrypt`/`argon2` lib |
| `bun:sqlite` / `Deno KV` | `@youneed/orm-sql` (`node:sqlite`) / `@youneed/kv` |
| `Bun.env` / `Deno.env` | `@youneed/server-plugin-env` (fail-fast env) |
| Web `WebSocket` server | `app.ws(...)` / `@youneed/server-plugin-pubsub` |

There is a Deno-flavored pubsub adapter, but the server core runs on Node — plan for a Node
runtime target.

## Interop adapters (keep old + new coexisting)

| Seam | Package | Call |
|------|---------|------|
| youneed comp → React tree | `@youneed/dom-adapter-react` | `toReact(Comp)` (events → `onX`) |
| React comp → youneed screen | `@youneed/dom-adapter-react` | `fromReact(Comp)` |
| Vue / Angular / Preact / Svelte / Astro | `@youneed/dom-adapter-{vue,angular,preact,svelte,astro}` | mount / wrap |
| Custom Element in any framework | — | render `<my-el>` directly, no adapter |

## Client codegen (replace tRPC/typed-client imports)

- **`@youneed/api-client`** — generate a typed TS client from the server's OpenAPI spec
  (CLI + runtime). Replaces importing a tRPC router type or hand-writing fetch wrappers.
  Keep the server's `t.*` schemas authoritative so the generated client stays in sync;
  run codegen in CI so drift fails the build.

## Order of operations

1. Land the tsconfig/bundler switch (scoped if legacy decorators remain).
2. Register DOM for any Node-side rendering/tests.
3. Stand up the interop adapter at the chosen seam.
4. Migrate leaves; carve each into the youneed-scoped build; delete the legacy version.
5. Wire codegen (`api-client`) once the first youneed routes expose an OpenAPI doc.
