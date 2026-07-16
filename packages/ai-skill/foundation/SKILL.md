---
name: youneed-foundation
description: "The shared foundation under every @youneed package and the tooling to build on it. @youneed/core — the zero-dependency primitives the whole monorepo builds on: shared type aliases, the class-metadata registry (createRegistry/ctorOf/classChain — the TC39 addInitializer + WeakMap pattern that makes decorators work under esbuild/tsx where Symbol.metadata is never emitted), and disposal helpers (dispose/isDisposable/disposeValue bridging plain cleanups to using/await using). @youneed/vite-plugin — the domFramework() Vite plugin that pre-transpiles TC39 standard decorators with esbuild (supported:{decorators:false}) before Vite's oxc/esbuild transform, which otherwise leaves them raw and breaks the entry graph. create-youneedpackage — the internal scaffolder for new workspace packages. Use this skill when authoring your own decorator-driven base class (Component/Controller/Test-style factory), when standard decorators fail to compile under Vite (blank page / SyntaxError), when adding using-based resource cleanup, or when scaffolding a new @youneed/* package."
license: ISC
---

# youneed — Foundation (@youneed/core + build tooling)

The base layer: the decorator/metadata/disposal primitives every youneed framework shares,
plus the Vite plugin and package scaffolder you need when building on or extending the stack.
Most app code never imports these directly — reach here when **authoring a framework-level
base class**, fixing a Vite decorator build, or adding a new package.

Source of truth: `packages/{core,vite-plugin,create-package}/src` and their READMEs. Verify a
signature before asserting it.

## Route to the reference

| Task | Read |
|------|------|
| Metadata registry (`createRegistry`/`ctorOf`/`classChain`), disposal helpers, shared types | `references/core.md` |
| Vite plugin (`domFramework()`) for TC39 decorators; scaffolding a new `@youneed/*` package | `references/build.md` |

## Why this exists — the one mechanism everything shares

`Component` (dom), `Controller` (server), `Page` (ssr), `Test`/`Fixture` (test) all use the
**same** trick: a TC39 decorator records *what* a member is into a per-class store via
`ctx.addInitializer`, and the runtime reads it back at construction. The store is a `WeakMap`
keyed by the constructor. **This is the esbuild/tsx-safe alternative to `Symbol.metadata`** —
which those bundlers never emit. `@youneed/core` is that mechanism, factored out.

```ts
import { createRegistry, ctorOf, classChain } from "@youneed/core";

const FIELDS = createRegistry<{ name: string; prop: string }[]>(() => []);
function field(name: string) {
  return (_v: unknown, ctx: ClassFieldDecoratorContext) =>
    ctx.addInitializer(function (this: object) {
      FIELDS.for(ctorOf(this)).push({ name, prop: String(ctx.name) });   // most-derived class
    });
}
```

## Ground rules (the reason the whole stack works)

- **Never rely on `Symbol.metadata`** at runtime — esbuild/tsx/Vite don't populate it. Use the
  `addInitializer` + `WeakMap` registry (`@youneed/core`) instead. This is the single most
  important build invariant across every youneed package.
- **Decorators go on real initialized fields**, never `declare` fields; `tsconfig` needs
  `experimentalDecorators: false`, `useDefineForClassFields: false`, `target: ES2022`+.
- **Under Vite you need `domFramework()`** first in `plugins` — oxc/esbuild at `esnext` leave
  standard decorators raw (a browser `SyntaxError` that blanks the page). `tsx`/`node --import
  tsx` lower them on their own, so no plugin is needed there.
- **Prefer `using`/`await using`** for resource cleanup via the disposal helpers — the same
  pattern the server's `gracefulShutdown` and test-fixture teardown use.
