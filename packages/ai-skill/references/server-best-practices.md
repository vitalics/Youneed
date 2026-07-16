# @youneed/server — Production Best Practices

A do/don't checklist for shipping a real `@youneed/server` app. Verbs map to real
exports; deeper material in `./middleware.md` (security headers + catalog), `./auth.md`,
`./performance.md` (throughput). Layering rules live in `./organization.md`.

## Structure: thin Controllers, plain services

- **DO** keep handlers HTTP-only — validate, call a service, return a value/`Response`.
- **DON'T** put DB/business logic inline in a handler.

```ts
class Users extends Controller("/users") {
  constructor(private svc: UserService) { super(); }     // inject deps via ctor
  @Controller.post({ body: CreateUserDTO, response: { 201: User } })
  async create(ctx) { return Response.json(await this.svc.create(ctx.body), { status: 201 }); }
}
```

## Guards vs interceptors vs middleware — pick the narrowest scope

- **Guard** = pre-gate (`true`/`false`/`throw HttpError`), cannot transform. `@Controller.guard(fn)`.
- **Interceptor** = wraps the handler, can transform result/timing. `@Controller.intercept(fn)`.
- **Middleware** = path-prefix/global concern. `app.use(mw)` / `app.use("/admin", mw)`.
- **DO** scope to one method/class before reaching for global `use()`.
- **DON'T** reimplement auth as a middleware when a guard fits, or vice-versa.

## Validation: schema DTOs + the non-throwing `parse()`

- **DO** define DTOs once (`@youneed/schema` class-validator style) and reference them
  from `body/params/response` so they drive validation *and* the compiled serializer.
- **DO** use `parse()` for non-throwing branches; route schemas validate automatically (422).

```ts
import { parse } from "@youneed/schema";
const r = parse(CreateUserDTO, ctx.body);                // { success, value } | { success, error }
if (!r.success) return Response.json({ issues: r.error.issues }, { status: 422 });
```

## Error handling: throw `HttpError`, let the boundary respond

- The dispatcher catches: `HttpError` → its `status`+payload; anything else → `console.error`
  + a generic `500 {"error":"Internal Server Error"}`. **DON'T** leak stack/internal messages.
- **DO** signal client errors by `throw new HttpError(status, payload)`; never `res.end()` yourself.

```ts
import { HttpError } from "@youneed/server";
if (!user) throw new HttpError(404, { error: "Not found", requestId: ctx.requestId });
```

## Correlation: request-id → logger → trace

- **DO** mount `requestId()` early, then `requestLogger({ logger })` in structured mode so each
  line carries `requestId` (and `traceId` when `tracing()` ran). `trace(msg)` logs correlated.
- **DON'T** scatter `console.log`; bind one child logger per request.

```ts
import { requestId } from "@youneed/server-middleware-request-id";
import { requestLogger } from "@youneed/server-middleware-request-logger";
app.use(requestId()).use(tracing()).use(requestLogger({ logger }));
```

## Config & secrets: fail fast at boot

- **DO** validate env once at module top level with `@youneed/server-plugin-env`; `.secret()`
  fields are masked in errors/devtools. **DON'T** read scattered `process.env`.

```ts
import { defineEnvironmentVariables, t, environment } from "@youneed/server-plugin-env";
export const env = defineEnvironmentVariables(process.env, {
  schema: { PORT: t.port().default(3000), DATABASE_URL: t.url().secret() },
});                                                       // throws EnvError listing ALL issues
app.plugin(environment({ schema: { PORT: t.port().default(3000) } })); // redacted in topology
```

## Logging: universal core + `this.log` provider

- **DO** build one `createLogger()` (JSON + redaction); pick a transport at the edge
  (`logger-transport-{stdout,file,http}`). Inject the request-scoped child via `loggerProvider`.

```ts
import { createLogger } from "@youneed/logger";
import { logger, loggerProvider } from "@youneed/server-middleware-logger";
const base = createLogger({ redact: ["password", "authorization"] });
app.use(logger(base));                                   // binds request-scoped child to ctx
// in a Controller field: log = loggerProvider(base);  → this.log.info("created", { id })
```

## Graceful shutdown: drain under SIGTERM

- **DO** call `.gracefulShutdown()` so SIGTERM drains in-flight requests, force-closes idle
  sockets at the deadline, and disposes controllers with `[Symbol.asyncDispose]`.
- **DON'T** `process.exit()` on a signal — you cut live requests.

```ts
app.listen(env.PORT, () => {}).gracefulShutdown({ signals: ["SIGTERM", "SIGINT"], timeout: 10_000 });
// or explicitly: await server.drain({ timeout: 10_000 });
```

## Observability: health, metrics, trace, timing

- **DO** expose k8s `health()` probes (paired with shutdown), `metrics()` for Prometheus,
  `tracing()` for W3C/OTel propagation, `serverTiming()` for per-segment timings.

```ts
import { health } from "@youneed/server-middleware-health";
import { metrics } from "@youneed/server-middleware-metrics";
app.use(health({ checks: { db: () => pool.totalCount > 0 } }))
   .use(metrics({ path: "/metrics" }));
```

## Testing: run the real server as a precondition

- **DO** test services without HTTP; for E2E use `@youneed/test`'s `webServer` precondition
  (boots your built server, waits on `url`/`port`, tears down) — see the `youneed-test` skill.

```ts
TestApplication().webServer({ command: "node dist/main.js", url: "http://localhost:3000", timeout: 30_000 });
```

## Deployment: generate artifacts, fan out across cores

- **DO** emit a multi-stage `Dockerfile`/`.dockerignore`/`docker-compose.yml` (with the backing
  services your plugins actually use) via `@youneed/server-plugin-docker`.
- **DO** scale across CPUs with `@youneed/server-plugin-cluster` — the primary forks+respawns
  workers; each worker's own `gracefulShutdown` owns its exit.

```ts
import { docker } from "@youneed/server-plugin-docker";
import { cluster } from "@youneed/server-plugin-cluster";
app.plugin(docker()).plugin(cluster({ workers: 4, respawn: true }));
```

---

**Answering style:** open with the *do/don't* that fits the threat/scope, then one real
`use(...)`/decorator line. Names must be real exports with correct import paths (catalog +
ordering in `./middleware.md`). Route security-header/CORS/CSRF questions to `./middleware.md`,
auth/login to `./auth.md`, throughput to `./performance.md`. Recommend the minimal set — never the
whole catalog. Layering decisions live in `./organization.md`; deep server API in `./server.md`;
slow-endpoint tuning in `./performance.md`.
