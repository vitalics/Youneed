# @youneed/server-middleware-logger

Attach a **request-scoped** [`@youneed/logger`](../logger) child logger to every
request — bound to the correlation ids (`requestId`, and `traceId` when a trace
span ran upstream) — and expose it via `log(ctx)`. Every line a handler or
downstream middleware emits through `log(ctx)` then automatically carries those
ids, so a log search by `requestId`/`traceId` returns all of them together — no
manual id threading.

```ts
import { Application, Response } from "@youneed/server";
import { createLogger } from "@youneed/logger";
import { logger, log } from "@youneed/server-middleware-logger";

const base = createLogger();

const app = Application()
  .use(logger(base, { bindings: (ctx) => ({ method: ctx.request.method, url: ctx.request.url }) }))
  .get("/users", (ctx) => {
    log(ctx).info("listing users", { count: 3 });
    // → {"level":"info","message":"listing users","count":3,"requestId":"…","method":"GET","url":"/users"}
    return Response.json([/* … */]);
  });
```

## On a controller (`this.log`)

Attach the middleware at the **controller** level (class-wide) or per method, and
read the request-scoped logger inside a handler as **`this.log`** — no `ctx`
plumbing. `this.log` resolves the same child the middleware stored (falling back
to `console` when no logger middleware ran).

```ts
import { Application, Controller, Response } from "@youneed/server";
import { createLogger } from "@youneed/logger";
import { logger } from "@youneed/server-middleware-logger";

const base = createLogger();

class CatController extends Controller({ url: "/cats", middlewares: [logger(base)] }) {
  @Controller.get("/")
  list() {
    this.log.info("listing cats", { count: 2 }); // carries requestId/traceId
    return Response.json({ cats: ["a", "b"] });
  }

  @Controller.middleware(audit)        // extra middleware for just this route
  @Controller.get("/:id")
  one(ctx) {
    this.log.info("one cat", { id: ctx.params.id });
    return Response.json({ id: ctx.params.id });
  }
}

Application(CatController).listen(3000, () => {});
```

Controller middleware (class `middlewares: […]` and `@Controller.middleware(…)`)
runs **outside** the controller's guards/interceptors (Express-style). `this.log`
is provided by `@youneed/server`'s `Controller` base — it reads the request's
logger via async-local context, so it works in any method without taking `ctx`.

## API

- **`logger(base, opts?)`** — middleware. On each request builds `base.child({ requestId, traceId? })`
  and stores it on `ctx.state[opts.stateKey ?? "logger"]`. Register **early** so
  downstream middleware and the handler share the same contextual logger.
  - `stateKey` — `ctx.state` key the child is stored under (default `"logger"`).
  - `bindings(ctx)` — extra fields merged into the child (e.g. `method`/`url`).

  The `traceId` is read structurally from `ctx.state.span?.traceId` (set by an
  upstream trace middleware) — this package does **not** depend on the trace
  package. The all-zero id (`0000…`, an unsampled/no-op span) is skipped.

- **`log(ctx)`** — return the request's child logger. When the middleware isn't
  installed it returns a safe default `createLogger()` so calls never throw (the
  same no-op-accessor pattern as `connection()` in
  `@youneed/server-middleware-keep-alive`).

- **`LoggerMiddlewareOptions`** — `{ stateKey?, bindings? }`.

## vs `@youneed/server-middleware-request-logger`

| | this package | request-logger |
| --- | --- | --- |
| What it logs | nothing on its own — gives **your** code a logger | one **summary** line per request (`METHOD url status ms`) |
| Who emits | handlers / downstream middleware via `log(ctx)` | the middleware itself, once per request |
| Correlation | stamps `requestId`/`traceId` on **every** line you emit | stamps them on its single summary line |

Use both: `request-logger` answers *"what happened to this request?"*, this one
makes *every* contextual line you log share the same ids, so they group together.
