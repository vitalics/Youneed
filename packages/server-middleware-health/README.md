# @youneed/server-middleware-health

Kubernetes-style **liveness** and **readiness** probe endpoints for
[`@youneed/server`](../server).

```ts
import { Application, Response } from "@youneed/server";
import { health } from "@youneed/server-middleware-health";

const h = health({
  checks: {
    db: () => pool.totalCount > 0,
    cache: async () => (await redis.ping()) === "PONG",
  },
});

const app = Application()
  .use(h)                                   // register early
  .get("/users", () => Response.json([/* … */]));

// GET /healthz → 200 { status: "ok" }                      (liveness)
// GET /readyz  → 200 { status: "ready", checks: { … } }    (readiness, all pass)
//             → 503 { status: "not ready", checks: { … } } (any check failed)

app.listen(3000, (s) =>
  s.gracefulShutdown({ onShutdown: () => h.setReady(false) }),
);
```

## Liveness vs. readiness

- **Liveness** (`/healthz`) — "is the process alive?" A failing liveness probe makes
  Kubernetes **restart** the pod. Always `200 { status: "ok" }` unless you call
  `h.setLive(false)`.
- **Readiness** (`/readyz`) — "can it serve traffic *right now*?" A failing readiness
  probe pulls the pod out of the Service endpoints **without restarting it**. Returns
  `200 { status: "ready" }` when ready, `503 { status: "not ready" }` otherwise.

## Graceful shutdown

Wire `h.setReady(false)` into `gracefulShutdown`'s `onShutdown` hook:

```ts
app.listen(p, (s) => s.gracefulShutdown({ onShutdown: () => h.setReady(false) }));
```

On `SIGTERM` the readiness probe immediately starts failing, so the load balancer
**stops routing new requests before** in-flight connections drain — no dropped
requests during a rolling deploy.

## API

- **`health(opts?)`** — returns a `HealthMiddleware` (a middleware function with extra
  control methods attached). It intercepts `GET` requests to the probe paths; all
  other requests `return next()`. Options:
  - `livePath` — liveness path (default `"/healthz"`).
  - `readyPath` — readiness path (default `"/readyz"`).
  - `ready` — initial readiness state (default `true`).
  - `checks` — `Record<string, () => boolean | Promise<boolean>>`. Readiness runs all
    of them; any returning `false` (or throwing) → not ready, and the response body
    lists each check's pass/fail under `checks`.

  Control methods on the returned middleware:
  - `setReady(boolean)` — flip readiness (wire `false` into graceful shutdown).
  - `setLive(boolean)` — flip liveness (`false` → `/healthz` returns 503).
  - `ready` — current readiness state (getter).
  - `live` — current liveness state (getter).
