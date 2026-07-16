# @youneed/server-plugin-devtools

The analysis core behind the server devtools — a renderer-agnostic, serializable
**topology model** plus the tools that operate on it: an **OWASP-aligned security
audit**, an **OpenAPI generator**, and a **microbenchmark**. The browser UI (panels
on [`@youneed/dom-ui-shad`](../shad)) builds on this; this package is the pure, testable
data + analysis layer.

```ts
import { topology, externalServer, securityAudit, toOpenApi, microbench } from "@youneed/server-plugin-devtools";

const t = topology([
  { name: "api", middleware: ["cors", "helmet", "rate-limit"], routes: [/* … */] },
  externalServer({ name: "billing", url: "https://billing.acme.dev" }), // not behind our API
]);

securityAudit(t.servers[0]); // OWASP API Top 10 findings
toOpenApi(t.servers[0]);      // OpenAPI 3.1 document from route schemas
microbench(() => serialize(payload)); // ops/sec + p50/p99
```

| API | meaning |
| --- | --- |
| `topology(servers)` / `mergeTopologies(...)` | assemble / combine the topology model |
| `externalServer(info)` | declare a server **not** served through our API |
| `securityAudit(server)` | OWASP API-Security-Top-10 heuristics (auth, validation, rate-limit, BOLA, misconfig) |
| `auditGrade(findings)` | roll findings up to `pass` / `warning` / `error` |
| `toOpenApi(server, opts?)` | OpenAPI 3.1 document from routes + JSON schemas |
| `microbench(fn, opts?)` / `microbenchAsync` | quick perf measurement (ops/sec, mean, p50, p99) |

## Security audit (OWASP API Security Top 10, 2023)

Heuristics over the topology + the mounted `@youneed/server-middleware-*`:

- **API1 (BOLA)** — an `:id` route with no guard → object-level-authorization hint.
- **API2 (broken auth)** — a mutating route (POST/PUT/PATCH/DELETE) with no guard
  or auth middleware → `error`.
- **API3 (tampering)** — a body-carrying route with no validation schema.
- **API4 (resource consumption)** — no `rate-limit` / `body-limit` middleware.
- **API8 (misconfiguration)** — no `helmet` / `cors` / `https-redirect`.

It's a fast first pass, not a substitute for a real review.

## UI (`@youneed/server-plugin-devtools/ui`)

A `<server-devtools>` web component built on [`@youneed/dom-ui-shad`](../shad) renders the
analysis core as tabs — **Topology**, **Security**, **OpenAPI**, **Bench** — using
shad cards, tabs, badges, data-tables, inputs and buttons. Feed it a topology;
add external servers from the UI; run the microbench on demand.

```ts
import "@youneed/server-plugin-devtools/ui";       // registers <server-devtools>
import { registerTailwind } from "@youneed/dom-ui-shad";
registerTailwind(tailwindCss);              // shad needs Tailwind + theme.css (document level)

const el = document.querySelector("server-devtools");
el.topology = myTopology;                   // ServerTopology
el.benchmarks = [{ name: "serialize", run: () => serialize(payload) }]; // optional
```

`@youneed/dom` + `@youneed/dom-ui-shad` are optional peers (only needed for `/ui`).

## Plugin + programmatic API (`@youneed/server-plugin-devtools/serve`)

Point it at a **live** `@youneed/server` app and it mounts a devtools endpoint that
serves the web UI wired to the app's real `app.topology()` — no hand-declared
data. This is the easiest way to see your own server.

Preferred — register it as a first-class **server plugin** via `app.plugin(...)`:

```ts
import { Application } from "@youneed/server";
import { devtools } from "@youneed/server-plugin-devtools/serve"; // or from the package index

const app = Application(UsersController)
  .use(cors()).use(helmet()).use(rateLimit())
  .plugin(devtools({ name: "demo-api", url: "http://localhost:3000", path: "/__devtools", middleware: ["cors", "helmet", "rate-limit"] }));
app.listen(3000, () => {}); // open http://localhost:3000/__devtools
```

`devtools(opts?)` returns a `ServerPlugin` (`name: "devtools"`); its `setup(app)`
mounts the endpoints below onto the `AppBuilder`. `DevtoolsPluginOptions` carries
the same knobs as `serveDevtools` (`path`, `name`, `url`, `middleware`).

Or imperatively, on a live app — `serveDevtools(app, opts?)`:

```ts
import { serveDevtools } from "@youneed/server-plugin-devtools/serve";

const app = Application(UsersController).use(cors()).use(helmet()).use(rateLimit());
serveDevtools(app, { name: "demo-api", url: "http://localhost:3000", middleware: ["cors", "helmet", "rate-limit"] });
app.listen(3000, () => {}); // open http://localhost:3000/__devtools
```

> **Dev-only.** The devtools endpoint exposes your full route topology + schemas.
> Register it only in development (e.g. guard the `app.plugin(devtools())` call
> behind `process.env.NODE_ENV !== "production"`) or put it behind auth.

It registers, under `path` (default `/__devtools`): the UI page, `/topology.json`
(the live topology), and `/client.js` (the prebuilt UI bundle, shipped in
`dist/web`, built via `pnpm --filter @youneed/server-plugin-devtools build:web`).

`fromApp(app, meta)` is also exported if you want the `ServerInfo` directly. The
live topology is produced by `@youneed/server`'s `app.topology()` (route registry:
methods, paths, controllers, guard/interceptor counts, JSON schemas, ws/sse).
Because mounted middleware are anonymous functions, pass `meta.middleware` (the
security-relevant names) so the audit is accurate.

Runnable demo: `pnpm examples:serve:server-devtools` → real server at
`http://localhost:3000/__devtools`.

## Roadmap

Done: analysis core, live `app.topology()` introspection, the shad UI, and the
`serveDevtools` programmatic API. Planned next, on confirmation: **AsyncAPI** for
ws/sse routes, and extracting a shared renderer-agnostic devtools shell so the
DOM and server panels share chrome.
