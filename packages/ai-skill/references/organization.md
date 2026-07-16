# youneed — Code Organization

How to structure a youneed app and where things belong.

## Monorepo shape (this framework)

pnpm workspace. Core packages under `packages/*`, runnable demos under `examples/*`.
Each package is `@youneed/<name>` with its own `README.md` and `src/`. Middleware are
*separate* packages (`@youneed/server-middleware-*`) so apps depend only on what they use;
`createCache` stays in the server core. Adapters (ORM, logger transports, KV backends)
are also separate packages. New package: scaffold with `@youneed/create-package`.

## Application layering

Keep framework-facing classes thin; push logic into plain services.

```
src/
  controllers/      # Controller classes — HTTP shape only, no business logic
  services/         # plain classes with the real logic (testable without HTTP)
  guards/           # (ctx) => boolean access checks
  interceptors/     # cross-cutting around-handler concerns
  middleware/       # app-specific use() middleware (reusable ones → a package)
  schema/           # t.* / @youneed/schema DTOs, shared between routes
  components/        # @youneed/dom components (if the app has a UI)
  pages/            # @youneed/ssr Page classes (SSR/SSG routes)
  main.ts           # Application(...).use(...).listen(...).gracefulShutdown()
```

## Server-side placement rules

- **Controllers** own routing + (de)serialization only. A handler validates via schema,
  calls a service, returns a value/`Response`. No DB/business logic inline.
- **Guards** = pre-gate access (`true/false/throw HttpError`). **Interceptors** = wrap
  the handler (timing, result transform). **Middleware** = path-prefix/global concerns.
  Choose the narrowest scope that fits — method > class > scoped `use("/prefix")` > global.
- **Schemas** are the contract: define once in `schema/`, reference from `params/body/response`.
  They drive validation, the compiled serializer, and `.openapi()` — keep them authoritative.
- **Cross-cutting reusable behavior** → its own `@youneed/server-middleware-*` package,
  not copy-pasted middleware.
- **Shared state / external clients** (db pool, redis, logger) → construct once, inject
  into controllers/services via the constructor; dispose via `[Symbol.asyncDispose]` so
  `gracefulShutdown` cleans up.

## Frontend-side placement rules

- One component = one custom-element tag = one file. Co-locate `css` in `static styles`.
- Public contract via a typed `Props` + `@Component.event` outputs; keep internal
  reactive state as private `@Component.prop` fields.
- Lift shared logic into plain functions/classes the component calls — components stay
  about rendering and reactivity, not domain rules.
- SSR routes are `Page` classes in `pages/`; client entry is the `clientScript` thunk.

## Configuration & observability

- Config via `@youneed/server-plugin-env` (env loader, fail-fast at boot) — never read `process.env`
  scattered through code.
- Logging via `@youneed/logger` (JSON + redaction + child loggers); pick a transport
  package (`logger-transport-{stdout,file,http}`) at the edge, keep the core universal.
- Correlate logs with the request via `requestId` / `trace()` / `request-logger` structured mode.

## Decorator hygiene (applies everywhere)

- TC39 decorators on initialized fields only — never on `declare` fields.
- Collect decorator metadata with `addInitializer` + a `WeakMap`; do not depend on
  `Symbol.metadata` (bundlers don't populate it).
