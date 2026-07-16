# @youneed/server-middleware-load-shed

Load-shedding (global concurrency limit) middleware for
[`@youneed/server`](../server). Under overload it **fast-fails surplus requests
with `503 Service Unavailable`** instead of letting them pile up, so the server
stays healthy.

```ts
import { Application, Response } from "@youneed/server";
import { loadShed } from "@youneed/server-middleware-load-shed";

const app = Application()
  .use(loadShed({ maxConcurrent: 500, retryAfter: 2 }))
  .get("/work", () => doExpensiveWork());
// once 500 requests are in flight, the 501st gets:
//   503 Service Unavailable
//   Retry-After: 2
//   { "error": "Service Unavailable" }
```

## What is load-shedding?

A server has finite capacity. When traffic exceeds it, naively accepting every
request makes things *worse*: queues grow, latency climbs, memory balloons, and
eventually the whole process falls over — taking down the requests it could have
served. **Load-shedding** caps how many requests are in flight at once and, past
that cap, rejects the surplus immediately with a cheap `503`. The requests you DO
accept stay fast. This is **backpressure**: a fast, honest "I'm full, come back
later" beats a slow, dishonest "maybe..." that never lands.

The middleware keeps a counter: it increments before calling the next handler and
decrements in a `finally`, so a slot is freed whether the request succeeds or
throws. On entry, if the counter is at the limit, it sheds.

### vs. rate-limiting

Rate-limiting is **per-client over a time window** (e.g. "100 req/min per API
key") — a fairness/abuse policy. Load-shedding is a **global, here-and-now
capacity** gate: it doesn't care who you are, only whether the server has room
*right now*. They're complementary — rate-limit for fairness, shed load for
survival.

## API

- **`loadShed(opts?)`** — middleware. Tracks in-flight requests; sheds the surplus
  with `503` + `Retry-After` (does not call `next()`). Options:
  - `maxConcurrent` — max in-flight requests before shedding (default `100`).
  - `retryAfter` — seconds advertised in the `Retry-After` header (default `1`).
  - `shouldShed(ctx, inflight)` — custom shed decision, used **instead of** the
    `inflight >= maxConcurrent` threshold. Return `true` to shed. Fold in extra
    load signals (event-loop lag, memory pressure, …):

    ```ts
    loadShed({
      shouldShed: (_ctx, inflight) => inflight >= 500 || eventLoopLagMs() > 50,
    });
    ```

  The returned middleware also carries a live **`.inflight`** getter (current
  in-flight count) for metrics/health checks.
