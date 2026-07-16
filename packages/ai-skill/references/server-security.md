# Hardening a @youneed/server app — Defense in Depth

Security is layered middleware, not one flag. Each layer is a separate package
exposing a factory you pass to `app.use(...)`; gates go *before* the work they
guard (`use()` is an onion — first registered is outermost). This file covers the
posture; for per-request credential **verification** (api-key/bearer/jwt/
authorization/webhook-signature) and **login** (OAuth2/OTP) see `./auth.md`, and
for the full middleware catalog see `./middleware.md`.

## Threat → mitigation → package + `use(...)`

| Threat | Mitigation | Package · wiring |
|--------|-----------|------------------|
| XSS, clickjacking, MIME-sniff, info leak | Hardening response headers (CSP/HSTS/X-Frame-Options/Referrer-Policy/COOP/CORP) | `@youneed/server-middleware-helmet` · `helmet()` |
| Cross-origin reads of credentialed responses | Restrict allowed origins; never `origin:"*"` with credentials | `@youneed/server-middleware-cors` · `cors({ origin:["https://app.example.com"], credentials:true })` |
| CSRF on cookie-auth state changes | Double-submit cookie; unsafe verbs must echo the token | `@youneed/server-middleware-csrf` · `csrf()` (token at `ctx.state.csrf`; cookie is NOT HttpOnly by design) |
| Brute force / abuse / scraping | Per-client rate limit, `429` + `X-RateLimit-*` | `@youneed/server-middleware-rate-limit` · `rateLimit({ windowMs:60_000, max:300 })` |
| Memory exhaustion via huge bodies | Cap declared + streamed body size, `413` | `@youneed/server-middleware-body-limit` · `bodyLimit("2mb")` |
| Unauthorized network reach (admin, internal) | Allow/deny by IP/CIDR (default-deny on non-empty `allow`) | `@youneed/server-middleware-ip-filter` · `ipFilter({ allow:["10.0.0.0/8"] })` — mount `trustProxy()` first |
| Plaintext HTTP / non-canonical host | Force HTTPS + canonical host in one `308` | `@youneed/server-middleware-https-redirect` · `httpsRedirect({ host:"example.com" })` |
| Spoofed `X-Forwarded-*` (wrong client IP) | Resolve real IP/proto/host from a trusted proxy only | `@youneed/server-middleware-trust-proxy` · `trustProxy({ hops:1 })` — register FIRST |
| Duplicate side effects (double-click, retry, at-least-once webhook) | `Idempotency-Key` replay window; one side effect | `@youneed/server-middleware-idempotency` · `idempotency({ ttl:86400 })` |
| Slow handlers hanging clients | Deadline → `503`/`504` | `@youneed/server-middleware-timeout` · `timeout(5000)` |
| Overload / thundering herd | Global concurrency cap, fast-fail `503` + `Retry-After` | `@youneed/server-middleware-load-shed` · `loadShed({ maxConcurrent:500 })` |
| HTTP/2 Rapid Reset (CVE-2023-44487), stream floods | Tear down abusive sessions (GOAWAY) | `@youneed/server-middleware-http2-guard` · `http2Guard()` |
| Session forgery / theft | Signed (HMAC) id cookie, HttpOnly+SameSite, data in store | `@youneed/server-middleware-session` · `session({ secret })` — see below |
| Stolen credentials, missing auth | Verify a credential per request | api-key / bearer / jwt / authorization — see `./auth.md` |
| Forged inbound webhooks | HMAC over raw body + replay window | webhook-signature — see `./auth.md` |
| Hardcoded / leaked secrets | Fail-fast validated env, redacted in logs/topology | `@youneed/server-plugin-env` · `environment({ schema })` — see below |

## Recommended baseline stack — correct order

Order matters: identify the real client first, redirect/filter before any work,
stamp headers, throttle before parsing, parse/limit, then auth, then routes.

```ts
import { Application } from "@youneed/server";
import { trustProxy } from "@youneed/server-middleware-trust-proxy";
import { ipFilter } from "@youneed/server-middleware-ip-filter";
import { httpsRedirect } from "@youneed/server-middleware-https-redirect";
import { helmet } from "@youneed/server-middleware-helmet";
import { cors } from "@youneed/server-middleware-cors";
import { rateLimit } from "@youneed/server-middleware-rate-limit";
import { loadShed } from "@youneed/server-middleware-load-shed";
import { bodyLimit } from "@youneed/server-middleware-body-limit";
import { timeout } from "@youneed/server-middleware-timeout";
import { jwt } from "@youneed/server-middleware-jwt";          // verify — see ./auth.md

Application(MyController)
  .use(trustProxy({ hops: 1 }))                                // 1. real client IP/proto (FIRST)
  .use(httpsRedirect({ host: "example.com" }))                 // 2. force TLS + canonical host
  .use(ipFilter({ deny: ["203.0.113.0/24"] }))                 // 3. drop known-bad early
  .use(helmet())                                               // 4. security headers on every response
  .use(cors({ origin: ["https://app.example.com"], credentials: true }))
  .use(loadShed({ maxConcurrent: 500 }))                       // 5. survive overload
  .use(rateLimit({ windowMs: 60_000, max: 300 }))              // 6. reject abuse before work
  .use(bodyLimit("2mb"))                                       // 7. cap before buffering
  .use(timeout(5000))                                          // 8. bound tail latency
  .use("/api", jwt({ secret: process.env.JWT_SECRET! }))       // 9. authn, scoped
  .listen(3000, () => {})
  .gracefulShutdown();
```

Add per-posture: `csrf()` only for cookie-authenticated state changes (pointless
on a stateless token API); `idempotency({ ttl })` on unsafe payment/order routes;
`http2Guard()` when serving HTTP/2; `ipFilter({ allow:[…] })` scoped to `/admin`.

## Secure sessions & cookies

`session({ secret })` puts only the **signed** session id in the cookie
(`<id>.<hmac>`, constant-time verified); data lives in a `SessionStore`. The
cookie defaults to `HttpOnly` + `SameSite=Lax` + `Path=/`. Set `secret` from env,
add `Secure` via the `cookie` option in production, and **always back it with a
shared store across instances** (the default `MemoryStore` is per-process — a
request landing on another pod sees an empty session):

```ts
import { session, KvSessionStore } from "@youneed/server-middleware-session";
import { redisKV } from "@youneed/kv-redis";

app.use(session({
  secret: process.env.SESSION_SECRET!,                         // never hardcode
  cookie: { secure: true },                                    // HTTPS-only cookie
  store: new KvSessionStore(redisKV({ url: process.env.REDIS_URL! }), { ttl: 86_400 }),
}));
```

The same applies to the other stateful gates: `rateLimit({ strategy: new
KvFixedWindow(kv, { windowMs, max }) })` and `idempotency({ store: new RedisKV({
url }) })` — without a shared store each instance counts/caches on its own (limit
becomes N×max; one side effect per pod). See `./middleware.md`.

## Secrets — fail-fast, never hardcoded

Validate every secret/config at boot with `@youneed/server-plugin-env`; invalid
or missing values abort startup with all issues listed, and `.secret()` fields
are masked (`[REDACTED]`) in errors, logs, and `app.topology()`/devtools.

```ts
import { environment, t } from "@youneed/server-plugin-env";

const envPlugin = environment({
  schema: {
    JWT_SECRET: t.string().min(32).secret(),
    SESSION_SECRET: t.string().min(32).secret(),
    REDIS_URL: t.url().secret(),
    NODE_ENV: t.enum(["development", "production", "test"] as const).default("development"),
  },
});
app.plugin(envPlugin);
envPlugin.values.JWT_SECRET;                                   // typed, validated
```

(Or `defineEnvironmentVariables(process.env, { schema })` at module top level for
a plain typed object. See `youneed-logging` skill for the env + logger pairing.)

## Answering style

- Lead with the **threat**, then the one package that mitigates it — don't stack
  the whole catalog. CSRF on a Bearer/JWT API, or `cors({origin:"*"})` with
  credentials, are anti-patterns; call them out.
- Always show the `use(...)` **in the right order** — `trustProxy()` first,
  cheap rejects (ip-filter/https-redirect/rate-limit/load-shed) before body
  parsing, auth before routes. A wrong order is a real vulnerability (limit keyed
  on the proxy IP, body buffered before the size check).
- For multi-instance deployments, insist on a **shared store** for session /
  rate-limit / idempotency, or the protection silently degrades.
- Secrets come from `server-plugin-env`, never literals; recommend `.secret()`
  + `.min()` on keys.
- For credential verification and login, defer to `./auth.md` rather than
  re-explaining it here.
```
