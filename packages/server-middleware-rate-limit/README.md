# @youneed/server-middleware-rate-limit

Rate-limit requests with a pluggable strategy (default `429 Too Many Requests`),
emitting standard `X-RateLimit-*` and `Retry-After` headers. Pick a built-in by
name, or pass your own `RateLimitStrategy` instance.

```ts
import { Application } from "@youneed/server";
import { rateLimit, TokenBucket } from "@youneed/server-middleware-rate-limit";

Application()
  .use(rateLimit({ windowMs: 60_000, max: 100 }))            // fixed window, global
  .use("/api", rateLimit({ strategy: new TokenBucket({ capacity: 50, refillPerSec: 5 }) }))
  .listen(3000, () => {});
```

| strategy | shorthand | behaviour |
| --- | --- | --- |
| `FixedWindow` | `"fixed"` | one counter per `windowMs`; cheapest, can allow up to 2×max across a boundary |
| `SlidingWindowLog` | `"sliding"` | limit holds over the last `windowMs` at every instant; no boundary burst |
| `TokenBucket` | `"token-bucket"` | spend one token per request, refill continuously; allows bursts up to `capacity` |
| `ExponentialBackoff` | `"exponential"` | cooldown DOUBLES each strike (capped at `maxBlockMs`); a clean window forgives |

> Default key is the client IP. Override with `key: (ctx) => …` (e.g. an API key
> or user id). Drop in a custom limiter by subclassing `RateLimitStrategy`.

## Distributed limits across instances (KV-backed)

The built-in strategies above keep their counters in an in-process `Map`. That is
correct for a **single** instance, but behind a load balancer with _N_ app
instances each process counts on its own — so the effective limit becomes
`max × N`. To enforce one shared limit you need a shared counter.

`KvFixedWindow` is a fixed-window limiter backed by a [`@youneed/kv`](../kv)
store. Every instance increments the **same** bucket key in the shared store, so
the limit holds across the whole fleet:

```ts
import { Application } from "@youneed/server";
import { rateLimit, KvFixedWindow } from "@youneed/server-middleware-rate-limit";
import { RedisKV } from "@youneed/kv-redis"; // a store shared by every instance

const kv = new RedisKV({ url: process.env.REDIS_URL });

Application()
  .use(rateLimit({ strategy: new KvFixedWindow(kv, { windowMs: 60_000, max: 100 }) }))
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
