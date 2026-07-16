# Migration strategy — order, seams, interop, rollback

Pick the shape (`SKILL.md`), then sequence the work so every step is shippable and
reversible. The default is the **strangler**: youneed grows inside the old app until the
old app is gone.

## Recommended order (full-stack app)

1. **Build switch (blocking).** Add a youneed-compatible tsconfig / bundler config so
   TC39 decorators compile alongside the old code. Nothing else works until this lands.
   → `references/tooling.md`.
2. **Schemas / DTOs.** Translate validation to `t.*` / `@youneed/schema`. These are the
   contract; frontend and backend both consume them. Do them once, shared.
3. **Backend leaf routes.** Move a low-traffic, low-dependency route group into a
   `Controller`; front it with a reverse proxy or mount path so the old server still
   owns everything else. → `references/backend.md`.
4. **Data layer** under the migrated routes (repository swap; can lag behind #3 if the
   old ORM stays reachable). → `references/data.md`.
5. **Frontend leaf components.** Migrate leaf/presentational components first, mount them
   in the old tree via an adapter. Work up toward containers. → `references/frontend.md`.
6. **Tests** move with each unit as it migrates — don't batch them to the end.
   → `references/testing.md`.
7. **Delete** the old path once parity is proven and no caller remains.

Frontend and backend are independent tracks — parallelize them across people.

## Where the strangler seam sits

- **Backend:** a path prefix. Mount migrated `Controller`s under `/v2/*` or put a proxy
  in front that routes known paths to youneed and the rest to the legacy server. Flip
  paths over one at a time; the proxy is the kill-switch for rollback.
- **Frontend:** a component boundary. A youneed Custom Element mounts directly in any
  framework's DOM; to embed inside React's virtual tree use `toReact(Comp)` from
  `@youneed/dom-adapter-react` (analogous adapters for vue/angular/preact/svelte/astro).
  To keep a still-legacy React widget inside a migrated youneed screen, use `fromReact`.
- **Data:** the repository interface. Hide the ORM behind a repo so the store can swap
  (old ORM → orm-sql) without touching callers.

## Interop adapters (the seam glue)

| Direction | Package | Call |
|-----------|---------|------|
| youneed component → React tree | `@youneed/dom-adapter-react` | `toReact(Comp)` (events as `onX`) |
| React component → youneed screen | `@youneed/dom-adapter-react` | `fromReact(Comp)` (custom element) |
| youneed ↔ Vue | `@youneed/dom-adapter-vue` | mount / wrap |
| youneed ↔ Angular | `@youneed/dom-adapter-angular` | mount / wrap |
| youneed ↔ Preact | `@youneed/dom-adapter-preact` | port of the react adapter |
| youneed ↔ Svelte | `@youneed/dom-adapter-svelte` | `action` + `mount` |
| youneed → Astro SSR | `@youneed/dom-adapter-astro` | SSR→string + `data-hydrate` |
| typed HTTP client from server OpenAPI | `@youneed/api-client` | codegen from spec |

Custom Elements are framework-agnostic — most frameworks can render `<my-el>` with no
adapter at all; adapters exist for prop/event ergonomics and virtual-DOM reconciliation.

## Rollback & parity

- **Keep the old path live** behind the proxy/adapter until the new one is proven; rollback
  = flip the route back. Never delete-then-migrate.
- **Parity gates before delete:** existing tests green against the new path; `bench/load.mjs`
  (autocannon) shows RPS/p99 at or above the old stack; visual/behavioral diff on UI.
- **Contract tests at the seam.** If old and new coexist, a shared schema + a contract test
  catches drift between the two implementations.

## Common traps

- Migrating a container before its leaves — you end up mounting still-legacy children through
  the adapter both ways. Go leaves-first.
- Porting Nest/Angular DI wiring literally — there is no DI container; reshape to constructor
  injection + a composition root early, or service graphs fight you the whole way.
- Deferring the tsconfig/decorator switch — legacy and TC39 decorators can't compile in one
  pass; sort the build before writing any youneed code (`references/tooling.md`).
