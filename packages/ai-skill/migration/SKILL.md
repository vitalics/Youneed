---
name: youneed-migration
description: "Migrating an existing app onto the youneed stack — porting a frontend from React/Vue/Angular/Lit/Preact/Svelte to @youneed/dom (web components, html``/css`` templates, field-level reactivity), a backend from Express/Nest/Fastify/Bun/Elysia/tRPC to @youneed/server (Controller classes, onion middleware, t.* schemas), the data layer from TypeORM/Prisma/Mongoose/Sequelize to @youneed/orm-sql / @youneed/orm-nosql / @youneed/kv, and tests from Jest/Vitest/Mocha to @youneed/test. Covers the incremental/strangler strategy, the interop adapters (@youneed/dom-adapter-{react,vue,angular,preact,svelte,astro}), OpenAPI client codegen (@youneed/api-client), and the TC39-decorator/tsconfig build switch. Use this skill when planning or executing a migration TO youneed, mapping an old framework's API to youneed's, or deciding migration order and interop boundaries."
license: ISC
---

# youneed — Migration Guide (port an existing app onto the youneed stack)

Migrations onto youneed are almost always **incremental** — new youneed code runs
*inside* the old app (or vice-versa) behind an interop adapter, and you strangle the
old stack piece by piece. Big-bang rewrites are the exception, not the default.

Everything here is TC39-decorator based (`experimentalDecorators: false`,
`useDefineForClassFields: false`, metadata via `addInitializer`+`WeakMap`, never
`Symbol.metadata`). Read `references/tooling.md` **first** if the source app uses
legacy decorators or a non-Node runtime — the build switch gates everything else.

Source of truth: `packages/{dom,server,orm-sql,orm-nosql,kv,test}/src/*`, the adapter
packages `packages/dom-adapter-{react,vue,angular,preact,svelte,astro}/src`, and
`packages/api-client/src`. Verify a signature in source before asserting it.

## Route to the reference for the task

| Migrating… | Read |
|------------|------|
| Overall plan — order, strangler boundaries, interop, rollback, parity checks | `references/strategy.md` |
| Frontend: React / Vue / Angular / Lit / Preact / Svelte → `@youneed/dom` | `references/frontend.md` |
| Backend: Express / Nest / Fastify / Bun / Elysia / tRPC → `@youneed/server` | `references/backend.md` |
| Data layer: TypeORM / Prisma / Mongoose / Sequelize / raw SQL → orm-sql / orm-nosql / kv | `references/data.md` |
| Tests: Jest / Vitest / Mocha / Jasmine → `@youneed/test` | `references/testing.md` |
| Build/runtime: tsconfig, decorator mode, bundler, Bun/Deno→Node, interop adapters, codegen | `references/tooling.md` |

A full-stack migration touches several: do `tooling.md` (build), then the layer refs in
the order `strategy.md` recommends. Frontend and backend can migrate independently.

## The three migration shapes

1. **Strangler (default).** Stand youneed up beside the old app; route one leaf
   (a component, a route group) at a time through youneed; delete the old code when the
   last caller is gone. Interop adapter holds the seam. Lowest risk, always reversible.
2. **Layer-by-layer.** Migrate one horizontal layer end-to-end (e.g. all DTOs/schemas
   first, then controllers, then services). Good when the old app is already well-layered.
3. **Big-bang.** Only for small apps or greenfield-adjacent rewrites. Skip the adapters.

## Ground rules for any migration

- **Lift schemas/DTOs first.** Zod/TypeBox/class-validator/Mongoose schemas → `t.*` or
  `@youneed/schema`. They drive validation, the compiled serializer, and the OpenAPI doc
  on the server side — everything downstream depends on them.
- **Keep the seam adapter-shaped, not fork-shaped.** Don't maintain two copies of a
  component/route; wrap the youneed one so the old app calls it, or vice-versa.
- **Prove parity before deleting.** Snapshot behavior (tests, `bench/load.mjs` RPS/p99,
  visual diff) on the old path, migrate, re-run, compare, *then* remove the old path.
- **camelCase gotcha survives into migration.** Ported React/Vue props with camelCase
  names won't bind through HTML parsing — group into one `.data=${obj}` or use events.
- **No frontend/Nest-style DI container.** Angular/Nest DI does not port 1:1 — inject via
  constructors and a composition root. Note this early; it reshapes service wiring.

## Answering style

- Show the **before → after pair** so the mapping is unambiguous.
- Name the exact interop adapter package and the wrap call (`toReact`, `fromReact`, …).
- Recommend a migration *order* and where the strangler seam sits, not just API swaps.
- Prefer the decorator style (`@Component` / `Controller`) unless the source is already
  functional, then show the fluent builder.
