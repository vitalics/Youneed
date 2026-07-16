# youneed — Server Throughput & Infra Optimization

The infra-level companion to `references/performance.md`. That file covers
component renders and per-endpoint profiling; this one covers **throughput,
tail latency, and scaling** for `@youneed/server`. Diagnose first, apply the one
matching lever, re-measure. Don't blanket-apply.

> Component/render bottlenecks and the "why is X slow?" flow live in
> `references/performance.md`. Middleware option shapes + ordering live in
> `references/middleware.md`. This file does not repeat them.

## What to reach for — symptom → lever → package

| Symptom | Lever | Package / API |
| --- | --- | --- |
| JSON serialize is the hot cost | declare a route `response` schema → compiled serializer | core `@youneed/server` |
| Identical responses recomputed | response cache (`compile:true` replays bytes) | `createCache` (core) |
| Cache must span instances | shared async cache | `createDistributedCache` (core) |
| Read-heavy, rare writes | serve stale, refresh in bg | `staleWhileRevalidate` on cache |
| Thundering herd on a cold key | single-flight (`x-cache: COALESCED`) | `coalesce` (default on) |
| Conditional GETs re-send bytes | `ETag` + 304 | `@youneed/server-middleware-etag` |
| Static assets | Range/206, ETag, 304 | `@youneed/server-middleware-static` |
| Bytes-on-wire too large | gzip/brotli over threshold | `@youneed/server-middleware-compression` |
| TCP/TLS handshake per request | reuse connections (HTTP/1.1) | `@youneed/server-middleware-keep-alive` |
| Overload collapses the server | fast-fail 503 over concurrency cap | `@youneed/server-middleware-load-shed` |
| One slow handler holds tail p99 | deadline → 503 | `@youneed/server-middleware-timeout` |
| HTTP/2 Rapid Reset / stream flood | per-session guard, GOAWAY | `@youneed/server-middleware-http2-guard` |
| Only 1 core used | fork workers across CPUs | `@youneed/server-plugin-cluster` |
| Heavy work on the request path | offload to scheduled jobs | `@youneed/server-plugin-jobs` |
| Need RPS/p99 numbers | bench harness | `packages/server/bench` |

## The hot path is already fast — use it right

`server.ts` is hand-tuned; the wins are mostly *not fighting it*:

- **Declare a `response` schema** on hot routes — the single biggest server win.
  At build time `compileJsonSerializer` walks the schema once and closure-composes
  a fixed-field serializer (precomputed quoted keys, no per-request `Object.keys`,
  no key escaping; the value was already coerced by output validation). Beats
  generic `JSON.stringify`. The schema option is literally named `response`:
  ```ts
  app.get("/users/:id", (ctx) => ({ id: 1, name: "Ada" }),
    { response: t.object({ id: t.number(), name: t.string() }) });
  // or a per-status map: { response: { 200: User, 404: Err } }
  ```
- **Return a value or `Response.json(...)`; don't write `res` yourself.** Returning
  takes the synchronous `send()` fast path (single `res.end()`, content-type
  captured during the one header loop). Writing `res.end()` manually makes the
  framework back off — no compiled serializer, no cache capture, no negotiation.
  Touch `res` only for streaming/SSE.
- **Keep hot routes static.** Static paths are an O(1) two-level `method → path`
  Map (no `"METHOD /path"` key string built). `:param` routes fall to a per-method
  regex list scanned in order — strictly slower. Avoid needless `:param` segments.
- **Reuse the built-in correlation id** (`ctx.requestId`) — a per-process counter
  ~100× cheaper than `crypto.randomUUID()`. Don't mint your own per request.
- **`body: false`** on upload/proxy routes opts out of request draining entirely —
  the handler streams the raw request, no buffering cost.

## Response cache (core, not a middleware package)

`createCache` / `createDistributedCache` are exported from `@youneed/server`
core (they hook the send engine). `.middleware()` returns the `app.use(...)` fn.

```ts
import { createCache, createDistributedCache } from "@youneed/server";

// in-process, synchronous; compile:true replays serialized bytes (zero re-serialize)
const cache = createCache({ ttl: 60_000, compile: true, staleWhileRevalidate: 30_000 });
app.use("/reports", cache.middleware());      // scope to the read-heavy prefix
cache.invalidate(/^GET \/reports/);            // on writes

// multi-node: shared async store (Redis KV), stores compiled bytes
const dist = createDistributedCache({ store: redisKV({ url }), ttl: 60_000 });
app.use(dist.middleware());                    // await dist.invalidate(...) / .clear()
```

`x-cache` response header: `HIT` · `MISS` · `STALE` (served during SWR refresh) ·
`COALESCED` (waited on the single in-flight computation; `coalesce` is on by
default). Scope caches narrowly — a global cache serves stale/leaked bodies on
POSTs and per-user routes.

## HTTP/2 + HTTP/3 — `listen(port, ListenOptions, cb)`

The same `(req,res)` handler serves HTTP/1.1 and HTTP/2 (node:http2 compat API).

```ts
app.listen(3000, { http2: true, key, cert }, (s) => s.gracefulShutdown());
//   http2: true  → h2 over TLS, ALPN HTTP/1.1 fallback (unless allowHTTP1: false)
//   http2: "h2c" → cleartext h2, prior-knowledge — proxy / service-to-service only
//                  (browsers don't speak h2c; WS upgrade unavailable)
app.listen(3000, { http3: true }, () => {});   // THROWS — no node:quic API
```

**HTTP/3** has no stable Node server API: `{ http3: true }` throws on purpose.
Terminate h3 at a proxy (Caddy, nginx-quic, Cloudflare) and forward to this
server over `{ http2: true, key, cert }`. Guard h2 with `http2Guard(...)`.

**Graceful shutdown:** `s.gracefulShutdown({ signals, timeout, onShutdown })`
wires SIGTERM/SIGINT → `drain()` (stop accepting, sweep idle sockets every 50ms,
force-close after `timeout`, default 10s). Also `await using` via `Symbol.asyncDispose`.

## Scaling out

```ts
// multi-core: fork one worker per CPU, shared listen socket, zero-downtime restart
import { cluster } from "@youneed/server-plugin-cluster";
app.plugin(cluster({ workers: 4 }))            // default: os.availableParallelism()
   .listen(3000, (s) => s.gracefulShutdown()); // primary supervises; workers serve

// offload heavy/periodic work OFF the request path (cron / interval / one-shot)
import { jobs } from "@youneed/server-plugin-jobs";
app.plugin(jobs({ jobs: [{ name: "purge", schedule: "0 */6 * * *", handler: purge }] }));
// fleet-wide once-per-occurrence: pass a leader-lock store (KV)
//   jobs({ store: redisKV({ url }), lockTtl: 60, jobs: [...] })
```

## Recommended high-throughput stack

```ts
Application(MyController)
  .use(loadShed({ maxConcurrent: 500, retryAfter: 1 }))  // shed before any work
  .use(timeout(5_000))                                    // bound tail latency
  .use(keepAlive({ timeout: 10, max: 1000 }))             // HTTP/1.1 conn reuse
  .use(etag())                                            // 304 on repeat GETs
  .use(compression({ threshold: 1024, brotli: true }))    // closest to response
  .use(metrics())                                         // RPS / latency histograms
  .use(createCache({ ttl: 60_000, compile: true }).middleware())
  .plugin(cluster({ workers: 4 }))
  .listen(3000, { http2: true, key, cert }, (s) => s.gracefulShutdown());
```

Overload protection (`load-shed`, `timeout`, `http2-guard`, `rate-limit`) overlaps
with `references/server-security.md` — see it for the threat-model framing.

## Measuring — don't trust micro-guesses

`packages/server/bench` (run via `pnpm --filter @youneed/server …`):

- **`bench`** — `bench/bench.mjs`, hyperfine + curl, per-endpoint **latency**.
  Keys include `json`, `json-typed` (compiled serializer), `json-cached` (replayed
  bytes). Times include curl's process-startup floor → read it **relative**
  (before/after on the same machine), not as absolute server speed.
- **`bench:load`** — `bench/throughput.bench.ts`, autocannon, in-process **RPS +
  p99** under keep-alive + concurrency vs Fastify / bare `node:http`. Use this for
  real throughput numbers.
- **`bench:frameworks`** — cross-runtime/cross-framework shoot-out (node/Bun/Deno).

Measure RPS and p99 before and after each change, and report the delta — not "should be faster".
