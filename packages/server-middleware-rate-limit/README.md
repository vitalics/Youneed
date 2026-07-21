# @youneed/server-middleware-rate-limit

Rate-limit requests with a pluggable strategy (default `429 Too Many Requests`),
emitting standard `X-RateLimit-*` and `Retry-After` headers. Pick a strategy with
a factory function — or pass your own `RateLimiter` instance.

```ts
import { Application } from "@youneed/server";
import { rateLimit, fixedWindow, tokenBucket } from "@youneed/server-middleware-rate-limit";

Application()
  .use(rateLimit({ strategy: fixedWindow({ windowMs: 60_000, max: 100 }) }))  // global
  .use("/api", rateLimit({ strategy: tokenBucket({ capacity: 50, refillPerSec: 5 }) }))
  .listen(3000, () => {});
```

| factory | shorthand | behaviour |
| --- | --- | --- |
| `fixedWindow(opts?)` | `"fixed"` | one counter per `windowMs`; cheapest, can allow up to 2×max across a boundary |
| `slidingWindow(opts?)` | `"sliding"` | limit holds over the last `windowMs` at every instant; no boundary burst |
| `tokenBucket(opts?)` | `"token-bucket"` | spend one token per request, refill continuously; allows bursts up to `capacity` |
| `leakyBucket(opts?)` | `"leaky-bucket"` | requests pour in, the bucket drains at `leakPerSec`; burst of `capacity`, then a strict one-per-interval pace (GCRA, Nginx `limit_req` model) |
| `exponentialBackoff(opts?)` | `"exponential"` | cooldown DOUBLES each strike (capped at `maxBlockMs`); a clean window forgives |
| `kvFixedWindow(kv, opts?)` | — | distributed fixed window on a shared KV — holds across instances (below) |

Factories return the strategy classes (`FixedWindow`, `SlidingWindowLog`,
`TokenBucket`, `LeakyBucket`, `ExponentialBackoff`, `KvFixedWindow`) — exported
too, for subclassing. String shorthands (`strategy: "fixed"`, configured via the
top-level `windowMs`/`max`/`maxBlockMs`) keep working for quick configs.

### Deep imports

Every strategy is also importable from its own subpath — handy when you want
just the limiter (e.g. in a test harness) without pulling the whole module:

```ts
import { fixedWindow } from "@youneed/server-middleware-rate-limit/strategies/fixedWindow.js";
import { leakyBucket } from "@youneed/server-middleware-rate-limit/strategies/leakyBucket.js";

Application().use("/api", rateLimit({ strategy: fixedWindow({ max: 100 }) }));
```

Available subpaths: `strategies/fixedWindow.js`, `strategies/slidingWindow.js`,
`strategies/tokenBucket.js`, `strategies/leakyBucket.js`,
`strategies/exponentialBackoff.js`, `strategies/kvFixedWindow.js` — each exports
the class, the factory and the config type.

> Default key is the client IP. Override with `key: (ctx) => …` (e.g. an API key
> or user id). Drop in a custom limiter by subclassing `RateLimitStrategy`.

## Provider form: the controller drives the limiter

`rateLimitProvider()` is a `ControllerProvider` injecting `this.rateLimit` — for
per-endpoint limits, conditional limiting (only the expensive paths), or several
checks per request, without mounting middleware on the route:

```ts
import { Controller, Response } from "@youneed/server";
import { rateLimitProvider, tokenBucket } from "@youneed/server-middleware-rate-limit";

class Billing extends Controller("/billing", {
  providers: [rateLimitProvider({ strategy: tokenBucket({ capacity: 10, refillPerSec: 1 }) })],
}) {
  @Controller.post("/charge")
  async charge() {
    await this.rateLimit.enforce(); // 429 + Retry-After when over — same as the middleware
    return Response.json({ ok: true });
  }

  @Controller.get("/quota")
  async quota() {
    const d = await this.rateLimit.check(); // verdict only — you decide what it means
    return Response.json({ limited: d.limited, remaining: d.remaining });
  }
}
```

- **`check(key?)`** → `Promise<RateDecision>` — records a hit, sets the
  `X-RateLimit-*` headers on the current response, returns the verdict
  (`limited`/`remaining`/`resetMs`/`retryAfterMs`). `key` defaults to the client
  key of the ambient request (same resolution as the middleware).
- **`enforce(key?)`** — `check` + the standard rejection when limited:
  `Retry-After` + `HttpError(429)` (status/message overridable via options).
- Options: everything `rateLimit()` takes, plus `member` — the instance member
  name (default `"rateLimit"`).

## Distributed limits across instances (KV-backed)

The built-in strategies above keep their counters in an in-process `Map`. That is
correct for a **single** instance, but behind a load balancer with _N_ app
instances each process counts on its own — so the effective limit becomes
`max × N`. To enforce one shared limit you need a shared counter.

`kvFixedWindow(kv)` is a fixed-window limiter backed by a [`@youneed/kv`](../kv)
store. Every instance increments the **same** bucket key in the shared store, so
the limit holds across the whole fleet:

```ts
import { Application } from "@youneed/server";
import { rateLimit, kvFixedWindow } from "@youneed/server-middleware-rate-limit";
import { RedisKV } from "@youneed/kv-redis"; // a store shared by every instance

const kv = new RedisKV({ url: process.env.REDIS_URL });

Application()
  .use(rateLimit({ strategy: kvFixedWindow(kv, { windowMs: 60_000, max: 100 }) }))
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `windowMs` | `60_000` | fixed window length |
| `max` | `100` | requests allowed per window |
| `prefix` | `"rl:"` | key prefix in the store (lets several limiters share one KV) |

How it stays correct under concurrency: each request does a single
`kv.incr(key, { ttl })`, which **atomically** increments the per-window bucket
counter and — only when that bucket key is first created — sets its expiry. One
atomic op means no read-modify-write race between instances; the verdict
(`count > max`) is computed from the returned value.

> **The shared store is what makes the limit correct.** Point a `MemoryKV` at it
> and you are back to per-process counting (`MemoryKV` lives in one process). Use a
> shared adapter such as `@youneed/kv-redis` in production so every instance
> reads and writes the same counter.

Because `KvFixedWindow.check` is async, `rateLimit()` awaits the verdict. The
limiter contract is the exported `RateLimiter` interface
(`{ limit; check(key, now): RateDecision | Promise<RateDecision> }`); the abstract
`RateLimitStrategy` and all built-ins implement it, and you can pass any
`RateLimiter` instance as `strategy`.
