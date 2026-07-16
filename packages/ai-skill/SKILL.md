---
name: youneed
description: "Expert assistant for the youneed framework (@youneed/dom web components and @youneed/server HTTP server, both on TC39 decorators). This skill should be used when answering questions about youneed components or server, organizing youneed code, optimizing performance bottlenecks, wiring up or recommending @youneed/server-middleware-* packages, adding authentication or login (OAuth2/OIDC providers, OTP, JWT/API-key verification, webhook signatures), handling file uploads, migrating a frontend from React/Vue/Angular/Lit to @youneed/dom, or migrating a backend from Express/Nest/Fastify/Bun/Elysia/tRPC to @youneed/server."
license: MIT
---

# youneed Framework Assistant

The youneed stack is a TypeScript framework built on **TC39 (Stage 3) decorators** —
not legacy `experimentalDecorators`. It has two halves that share idioms (class
decorators, field-level metadata, `Symbol.dispose`):

- **@youneed/dom** — web components (Custom Elements + Shadow DOM), `html``/`css``
  templates, field-level reactivity (`@Component.prop`). Compares to React/Vue/Angular/Lit.
- **@youneed/server** — Node HTTP server, `Controller` classes with `@Controller.get`
  decorators (or a fluent functional builder), onion-model middleware, guards,
  interceptors, schema validation. Compares to Express/Nest/Fastify/Bun/Elysia/tRPC.

Supporting packages: `@youneed/schema` (DTO validation), `@youneed/kv` + `@youneed/kv-redis`
(distributed stores), `@youneed/logger`, `@youneed/server-plugin-env`, `@youneed/ssr`/`ssg`,
`@youneed/dom-provider-virtual`, `@youneed/dom-adapter-react`, `@youneed/orm-sql`.

**Auth & identity** is a first-class area now: per-request verify middleware
(`server-middleware-{api-key,bearer,jwt,authorization,ip-filter,webhook-signature}`)
plus login `ServerPlugin`s (`server-plugin-oauth2` with ~19 IdP providers + Telegram
+ Госуслуги/ЕСИА, and `server-plugin-otp` for passwordless codes over email/SMS).
File uploads: `@youneed/server-upload` (streaming multipart). See `references/auth.md`.

## How to use this skill

Route to the reference file(s) for the task. Each is self-contained and < 200 lines.
Load only what the task needs; do not read all of them up front.

| Task | Read |
|------|------|
| Questions about components, templates, reactivity, lifecycle, events, SSR | `references/dom.md` |
| Questions about the server, routing, context, guards, interceptors, cache, WS/SSE | `references/server.md` |
| "Which middleware do I need for X?" / wiring `app.use(...)` | `references/middleware.md` |
| Adding login / auth — OAuth2 (GitHub/Google/…), OTP, JWT/API-key verification, webhooks | `references/auth.md` |
| Optimizing slow components or slow endpoints | `references/performance.md` |
| Server-side throughput/latency/infra tuning (serializer, compression, cache, HTTP/2, cluster) | `references/server-optimizations.md` |
| Hardening a server — helmet/CORS/CSRF/rate-limit/body-limit, middleware ordering | `references/server-security.md` |
| Idiomatic production server (structure, validation, errors, shutdown, observability, deploy) | `references/server-best-practices.md` |
| Realtime — WebSocket/SSE, pub/sub (+ Redis/Postgres/Kafka/Deno adapters), JSON-RPC | `references/realtime.md` |
| The ServerPlugin system + infra plugins (jobs/cron, cluster, docker, env, devtools) | `references/plugins-infra.md` |
| Authoring a devtools domain or UI panel on `@youneed/devtools-protocol` (server/dom/cli/ssr surfaces) | `references/devtools-plugins.md` |
| Accessibility in components — screen-reader announce, focus trap, reduced-motion, CSS audit | `references/a11y.md` |
| Internationalization — `@youneed/i18n` core + `i18n()` in templates, locale switching | `references/i18n.md` |
| Structuring a youneed project / where code goes | `references/organization.md` |
| Quick port of React / Vue / Angular UI to @youneed/dom (API map only) | `references/migrate-frontend.md` |
| Quick port of Express / Nest / Bun / Elysia / tRPC backend to @youneed/server (API map only) | `references/migrate-backend.md` |
| Planning/executing a full migration onto youneed (order, seams, data, tests, build switch, adapters) | defer to the **`youneed-migration`** skill |

When a task spans halves (e.g. an SSR page that also serves an API), read both
`dom.md` and `server.md`. Several areas have their own dedicated skill — defer to
them rather than answering from here: **`youneed-ssr`** (server-render / static
generation), **`youneed-cli`** (the CLI framework + `cli-middleware-*`/`cli-plugin-*`),
**`youneed-orm`** (SQL entities/repos + KV stores), **`youneed-logging`** (logger +
transports + env config), **`youneed-test`** (the test framework),
**`youneed-develop`** (devtools panel + `ts-plugin` editor integration),
**`youneed-migration`** (planning/executing a migration onto the youneed stack —
frontend/backend/data/tests, strangler order, interop adapters, the build switch),
**`youneed-security`** (RBAC authorization + secrets management),
**`youneed-feature-flags`** (the flag engine + server/dom/ssr/cli/test integrations
+ Vercel/LaunchDarkly/PostHog/Datadog adapters),
**`youneed-server-plugins`** (application plugins: GraphQL, gRPC, mailer, storage,
queue, OTLP trace export),
**`youneed-ui`** (the `shad` component library + composable component providers —
color-scheme/direction/logger/zustand/env),
**`youneed-clients`** (typed API-client codegen, resilient `http-client`, the
`server-adapter` runtime bridge for edge/serverless), and
**`youneed-foundation`** (`@youneed/core` metadata/disposal primitives + the Vite
plugin + the package scaffolder).

## Ground rules (apply to all youneed code)

- **TC39 decorators only.** `tsconfig`: `experimentalDecorators: false`,
  `useDefineForClassFields: false`, `target: ES2022`+. Decorators go on real
  initialized fields, never on `declare` fields.
- **Metadata is collected via `addInitializer` + a `WeakMap`**, not `Symbol.metadata`
  — esbuild/tsx/Vite do not populate `Symbol.metadata`. Never rely on it at runtime.
- **camelCase does not survive HTML attribute parsing.** In `html``, prefer one
  grouped `.data=${obj}` property over `.myProp=${x}`; preserve camelCase event
  names only through `@Component.event`. (See `references/dom.md`.)
- **Verify API names against the source before asserting them.** The canonical
  sources are `packages/dom/src/dom.ts`, `packages/server/src/server.ts`, and each
  package's `README.md`. Read the file rather than guessing a signature.
- **Server handlers return a value** (auto-serialized) or a `Response`/`File`
  descriptor — they do not write to `res` the Express way unless streaming.

## Confirming examples / running code

- Frontend examples live in `examples/dom`, `examples/dom-vs-react`, `examples/ssr`.
- Server examples live in `examples/http`, `examples/crud`, `examples/router-*`.
- For Node-side DOM (SSR/tests), call `registerDOM()` from `@youneed/dom/register`
  **before** importing components — never `GlobalRegistrator` directly.

## Answering style

- Give a concrete, compilable youneed snippet — not just prose.
- When recommending middleware, name the exact package and the `use(...)` call.
- When migrating, show the before→after pair so the mapping is unambiguous.
- Prefer the decorator (`Controller` / `@Component`) style unless the user is
  already using the fluent/functional builder.
