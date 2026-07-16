# @youneed/server-middleware-* — Catalog & Recommendation

Each is a separate package exposing a factory you pass to `app.use(...)`. Options
listed are from source; verify exact shapes against the package README before asserting.
Pick by need, then show the `use(...)` line.

## How to recommend

1. Identify the concern (security / auth / performance / observability / content / reliability).
2. Suggest the minimal set; do not bundle everything.
3. Mind ordering — `use()` is an onion, first registered is outermost. Typical order:
   `trust-proxy` → `ip-filter` → `https-redirect` → `helmet`/`cors` → `request-id` →
   `request-logger`/`trace` → `rate-limit`/`load-shed` → auth (`jwt`/`bearer`/…) →
   `body-limit` → `compression` → routes.
4. For distributed deployments, back stateful middleware with `@youneed/kv-redis` via
   each one's own adapter — `session` takes `store: KvSessionStore`, `rate-limit` takes
   `strategy: KvFixedWindow`. There is no shared `store` option.

## Authentication
> For the full picture (login plugins OAuth2/OTP, choosing between these, composing
> login→session→guard), read `references/auth.md`. Quick catalog:
- **api-key** — shared-secret key (`X-API-Key`/query/scheme), SHA-256-matched, optional `key→principal` map. `apiKey({ keys:{ "k_live_…":{ name:"billing" } }, hashed:false })`. Principal → `ctx.state.apiClient`.
- **bearer** — opaque Bearer token; your `verify` does the lookup. `bearer({ verify: async token => user ?? false })`.
- **jwt** — standard JWT (HS/RS/PS/ES) + JWKS. `jwt({ jwks:"https://…/jwks.json", algorithms:["RS256"], issuer, audience })` or `jwt({ secret })`.
- **authorization** — generic Authorization header with a **pluggable** signing algorithm (custom/national crypto, HSM). `authorization({ algorithm, key })`; `createTokens()` to issue. `sign`/`verify`/`resolveKey` may be async.
- **basic-auth** — HTTP Basic, constant-time. `basicAuth({ users:{ alice:"s3cret" }, realm:"Admin" })`.
- **session** — signed-cookie sessions, pluggable store. `session({ secret, cookieName:"sid", maxAge, store })`. Default `MemoryStore`; multi-node → `store: new KvSessionStore(redisKV({ url }), { ttl })`.

**Login plugins** (identity, not per-request verify — `app.plugin(...)`): `@youneed/server-plugin-oauth2` (OAuth2/OIDC, 19 bundled providers + Telegram + Госуслуги/ЕСИА), `@youneed/server-plugin-otp` (passwordless code over email/SMS). See `references/auth.md`.

## Security
- **cors** — CORS + preflight. `cors({ origin:"*"|string[]|true|fn, credentials:true, maxAge:3600 })`.
- **csrf** — stateless double-submit cookie. `csrf({ cookieName:"csrf", headerName:"x-csrf-token", protectedMethods:["POST","PUT","PATCH","DELETE"] })`.
- **helmet** — hardening headers (CSP/HSTS/X-Frame-Options). `helmet({ contentSecurityPolicy, hsts:{ maxAge, includeSubDomains, preload }, frameguard:"DENY" })`.
- **https-redirect** — force HTTPS + canonical host/path in one hop. `httpsRedirect({ host:"example.com", trailingSlash:"never", trustProxy:true, status:308 })`.
- **http2-guard** — defend HTTP/2 from Rapid Reset / stream floods. `http2Guard({ maxConcurrentStreams:100, windowMs:10_000, maxResetsPerWindow:100 })`.
- **trust-proxy** — resolve real IP/proto/host from `X-Forwarded-*`. `trustProxy({ trust:true, hops:1 })`. Put it first when behind a proxy/LB.
- **ip-filter** — allow/deny by IP (CIDR, IPv4/IPv6). `ipFilter({ allow:["10.0.0.0/8"], deny:["203.0.113.0/24"] })`. Deny wins; non-empty `allow` ⇒ default-deny. Mount `trustProxy()` first.
- **webhook-signature** — verify inbound webhook HMAC over the raw body + replay window. Presets are default exports: `import stripe from "@youneed/server-middleware-webhook-signature/stripe"`. See `references/auth.md`.

## Performance & load
- **compression** — gzip/brotli over a threshold. `compression({ threshold:1024, brotli:true })`.
- **body-limit** — reject oversized bodies (413). `bodyLimit("5mb")` or `bodyLimit(5_242_880)`.
- **load-shed** — global concurrency cap, fast-fail 503 + Retry-After. `loadShed({ maxConcurrent:500, retryAfter:1, shouldShed })`.
- **rate-limit** — per-client limiting via a pluggable `strategy` (no `store` option). In-process: name shorthands `"fixed"|"sliding"|"exponential"|"token-bucket"` or an instance `FixedWindow`/`SlidingWindowLog`/`TokenBucket`/`ExponentialBackoff`. `rateLimit({ windowMs:60_000, max:100 })` or `rateLimit({ strategy:new TokenBucket({ capacity:50, refillPerSec:5 }) })`. Multi-node → `strategy:new KvFixedWindow(redisKV({ url }), { windowMs, max })`.
- **timeout** — fail past a deadline (503). `timeout(5000, { status:503 })`.
- **keep-alive** — `Keep-Alive` header + programmatic socket control. `keepAlive({ timeout:10, max:1000 })`; `connection(ctx).close()/destroy()`. (HTTP/1.1 only; skipped on h2/h3.)

## Observability
- **metrics** — Prometheus counters/histograms/gauges, dependency-free. `metrics({ path:"/metrics", buckets:[...], prefix:"app_", route })`.
- **request-logger** — per-request access log (`METHOD url status ms`), structured mode correlates `traceId`. `requestLogger({ logger: createLogger(...), format })`.
- **request-id** — correlation id per request (trusted inbound `X-Request-Id` or generated), echoed + bound to the logger. `requestId()`; read with `getRequestId(ctx)`. Mount early (before the logger).
- **server-timing** — `Server-Timing` header for DevTools. `serverTiming({ total:true, precision:2 })`; in handler `timing(ctx).start("db")()` / `.add(name,dur,desc)` / `.measure(name, fn, desc)`.
- **trace** — W3C Trace Context distributed tracing (OTel-compatible). `tracing({ responseHeader:true, onEnd: span => exporter.push(span) })`.

## Content & static
- **static** — serve files with Range/206, ETag, Last-Modified, 304. `staticFiles("public", { index:"index.html", cacheControl:"public, max-age=3600" })`.
- **etag** — add ETag to GET/HEAD, answer If-None-Match with 304. `etag({ weak:true })`.
- **uploads** (not middleware) — `@youneed/server-upload` streams `multipart/form-data` with web streams, progress, and size/extension/type/name/content guards. Used in the handler on a `{ body:false }` route: `for await (const part of parseUpload(ctx, {...}))`. Not an `app.use(...)`.

## Reliability
- **health** — k8s liveness `/healthz` + readiness `/readyz` with checks. `health({ checks:{ db:()=>pool.totalCount>0, cache: async ()=>await redis.ping() } })`. Pair with `gracefulShutdown`.

## Writing a custom middleware — do / don't

Signature is `(ctx, next) => Promise<unknown>`. The return value flows back up the
chain and becomes the response, so what you return matters as much as what you do.

**Always `await next()` and return down the chain:**

```ts
// ✅ DO — await downstream, then return its result
app.use(async (ctx, next) => {
  const start = performance.now();
  const result = await next();                 // run handler + inner middleware
  ctx.response.setHeader("x-elapsed-ms", performance.now() - start);
  return result;                               // pass it back up
});

// ❌ DON'T — forgetting next() hangs the request; not returning drops the body
app.use(async (ctx, next) => {
  ctx.response.setHeader("x-elapsed-ms", 0);   // next() never called → stalls
});
```

**Short-circuit by returning, not by writing to `res`:**

```ts
// ✅ DO — return a value/descriptor to skip the handler
app.use((ctx, next) =>
  ctx.request.headers["x-blocked"]
    ? Response.json({ error: "blocked" }, { status: 403 })  // handler never runs
    : next());

// ❌ DON'T — write the socket yourself; the serializer/later middleware fight over it
app.use((ctx, next) => {
  if (ctx.request.headers["x-blocked"]) {
    ctx.response.statusCode = 403;
    ctx.response.end("blocked");                // bytes flushed; framework loses control
    return;                                     // no next() AND no return value
  }
  return next();
});
```

**Hand data downstream via `ctx.state`, never via shared scope:**

```ts
// ✅ DO — per-request scratch bag; headers after await next() are still safe
app.use(async (ctx, next) => {
  ctx.state.user = await authenticate(ctx);
  const res = await next();
  ctx.response.setHeader("x-user-id", ctx.state.user.id);
  return res;
});

// ❌ DON'T — module-scope state races across concurrent requests
let currentUser;                                // shared by every in-flight request!
app.use(async (ctx, next) => { currentUser = await authenticate(ctx); return next(); });
```

(Need the request across an `await` in deep code? Use `context()` from `@youneed/server`, not a global.)

## Wiring & ordering — do / don't

**Order is an onion; first registered is outermost. Put gates before the work they guard:**

```ts
// ✅ DO — real IP first, cheap rejects before expensive parsing, compression last
app.use(trustProxy({ hops: 1 }))                // 1. who is the client, really
   .use(rateLimit({ windowMs: 60_000, max: 300 })) // 2. reject before doing work
   .use(bodyLimit("2mb"))                        // 3. cap before buffering the body
   .use(compression());                          // 4. closest to the response

// ❌ DON'T — limit keyed on the proxy IP (all clients look identical), body buffered
//            before the size check, compression outermost (compresses nothing useful)
app.use(compression())
   .use(bodyLimit("2mb"))
   .use(rateLimit({ windowMs: 60_000, max: 300 }))
   .use(trustProxy({ hops: 1 }));                // too late — IP already read wrong
```

**Scope to the smallest path that needs it:**

```ts
// ✅ DO — cache only the read-heavy prefix
app.use("/reports", createCache({ ttl: 5_000 }).middleware());

// ❌ DON'T — cache globally; POSTs and per-user routes now serve stale/leaked bodies
app.use(createCache({ ttl: 5_000 }).middleware());
```

**Multi-node? Back stateful middleware with a shared store:**

```ts
// ✅ DO — wrap one KV in the right adapter per middleware (no shared `store` option):
//   session → KvSessionStore;  rate-limit → KvFixedWindow strategy
import { redisKV } from "@youneed/kv-redis";
import { KvSessionStore } from "@youneed/server-middleware-session";
import { KvFixedWindow } from "@youneed/server-middleware-rate-limit";
const kv = redisKV({ url: process.env.REDIS_URL! });
app.use(session({ secret, store: new KvSessionStore(kv, { ttl: 86_400 }) }))
   .use(rateLimit({ strategy: new KvFixedWindow(kv, { windowMs: 60_000, max: 300 }) }));

// ❌ DON'T — defaults are in-process (MemoryStore + per-process counter): behind N
//            pods each keeps its own sessions and the effective limit becomes N×max
app.use(session({ secret }))
   .use(rateLimit({ windowMs: 60_000, max: 300 }));
// ❌ DON'T — rate-limit has no `store` option, and session's store is NOT a raw KV
app.use(rateLimit({ windowMs: 60_000, max: 300, store: kv }))   // ignored / type error
   .use(session({ secret, store: kv }));                        // expects a SessionStore
```

**Recommend the minimal set, not the whole catalog:**

```ts
// ✅ DO — a public JSON read endpoint needs only what the threat model calls for
app.use(cors({ origin: ["https://app.example.com"] })).use(etag());

// ❌ DON'T — reflexively stack everything (csrf on a stateless token API is pointless,
//            session adds a cookie nobody reads, compression on tiny JSON wastes CPU)
app.use(helmet()).use(cors()).use(csrf()).use(session({ secret }))
   .use(compression()).use(rateLimit({ max: 100 })).use(metrics());
```

## Minimal production stack

```ts
Application(MyController)
  .use(trustProxy({ hops: 1 }))
  .use(helmet())
  .use(cors({ origin: ["https://app.example.com"], credentials: true }))
  .use(requestLogger())
  .use(rateLimit({ windowMs: 60_000, max: 300 }))
  .use(bodyLimit("2mb"))
  .use(compression())
  .use(health({ checks: { db: () => pool.totalCount > 0 } }))
  .use(metrics())
  .listen(3000, () => {})
  .gracefulShutdown();
```
