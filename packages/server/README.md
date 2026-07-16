# @youneed/server

A tiny, typed HTTP server on `node:http` — decorator **controllers**, schema
validation & inference, **guards**, Express-style **middleware**, and content
negotiation. Same paradigm as the rest of the toolkit: extend a base class, mark
methods with decorators, compose with a fluent builder.

## Install

```bash
pnpm add @youneed/server
```

## Controllers

```ts
import { Application, Controller, t, HttpError } from "@youneed/server";

const Cat = t.object({ name: t.string(), age: t.number() });

class Cats extends Controller("/cats", { guards: [requireApiKey] }) {
  @Controller.get("/:name", { params: t.object({ name: t.string() }), response: { 200: Cat } })
  async byName(ctx: Context) {
    const cat = lookup(ctx.params.name);
    if (!cat) throw new HttpError(404, { error: "Not found" }); // throw any status
    return cat;                                                  // validated against 200: Cat
  }

  @Controller.guard(isAdmin)            // per-method guard (stacks with class guards)
  @Controller.post({ body: Cat, response: { 201: Cat } })
  async create(ctx: Context) {
    return this.Response.json(ctx.body, { status: 201 });        // ctx.body is typed + validated
  }
}

Application(Cats)
  .use(requestLogger(), cors())          // global middleware (onion model)
  .openapi({ title: "Cats", version: "1.0.0" })   // → GET /openapi.json
  .listen(3000, (ctx) => console.log(`:${ctx.port}`));
```

## What you get

- **Routing** — `Controller(basePath, { guards })` + `@Controller.get/post/put/patch/delete`,
  or the fluent `app.get/post/...`. Static O(1) + per-method dynamic matching.
- **Schema layer** — `t.object/string/number/boolean/array/union/literal/optional/any`,
  `.meta(...)`; validates & coerces input, validates output by status code,
  drives `Infer<T>`, OpenAPI and AsyncAPI generation. `validate`, `isSchema`, `toJsonSchema`.
- **Guards** — `(ctx) => boolean | void`; `false` → 403, throw `HttpError` for any
  status. Class-level (`{ guards }`) run before per-method (`@Controller.guard`).
- **Middleware** — the core ships the *contract* (`app.use(mw)`, global or
  path-scoped `app.use("/admin", mw)`) and `createCache` (bound to the
  serialization engine, so it stays here). Everything else lives in its own
  lightweight package, installed à la carte (see **Middleware packages** below).
- **Responses** — return a value (auto-JSON), or `Response` / `Response.json` /
  `Response.text` / `File(path)`. WebSocket (`app.ws`) and SSE (`app.sse`).
- **Content negotiation** — `serialize`, `negotiate`, `contentTypeOf`, `respondAs`
  (JSON / XML / FIX by `Accept`, or a value's own `[Symbol.toSerialize]`).
- **Lifecycle** — `context()`/`trace()` (async-context request id); the server is
  `await using`-disposable and disposes controllers on shutdown.
- **Errors** — `HttpError(status, payload)`, `ValidationError` (422 by default).
- **Protocols** — HTTP/1.1 by default; HTTP/2 (TLS or cleartext) via a `listen`
  option; HTTP/3 ready at the call site (see below).

## Middleware packages

Middlewares are published separately so you install only what you use and the
core stays small. Each depends on `@youneed/server` and plugs in via `app.use`:

```ts
import { Application, createCache } from "@youneed/server";
import { cors } from "@youneed/server-middleware-cors";
import { helmet } from "@youneed/server-middleware-helmet";

Application().use(cors()).use(helmet()).listen(3000, () => {});
```

| package | export | purpose |
| --- | --- | --- |
| `@youneed/server-middleware-bearer` | `bearer` | Bearer-token auth |
| `@youneed/server-middleware-cors` | `cors` | CORS headers + preflight |
| `@youneed/server-middleware-rate-limit` | `rateLimit`, `RateLimitStrategy`, `FixedWindow`, `SlidingWindowLog`, `TokenBucket`, `ExponentialBackoff` | rate limiting, pluggable strategies |
| `@youneed/server-middleware-http2-guard` | `http2Guard` | HTTP/2 DoS protection (Rapid Reset, stream floods) |
| `@youneed/server-middleware-compression` | `compression` | gzip / brotli responses |
| `@youneed/server-middleware-request-logger` | `requestLogger` | per-request access logging |
| `@youneed/server-middleware-helmet` | `helmet` | security response headers |
| `@youneed/server-middleware-csrf` | `csrf` | stateless CSRF (double-submit cookie) |
| `@youneed/server-middleware-body-limit` | `bodyLimit` | reject oversized request bodies |
| `@youneed/server-middleware-timeout` | `timeout` | fail requests past a deadline |
| `@youneed/server-middleware-etag` | `etag` | ETag + conditional GET (304) |

`createCache` (response cache) stays in `@youneed/server` — it's woven into the
serialization/send engine. `rateLimit` is **pluggable**: pass `strategy` as a
built-in name (`"fixed"` · `"sliding"` · `"token-bucket"` · `"exponential"`) or a
`RateLimitStrategy` instance; roll your own by subclassing it (implement `decide`
+ `dead`). See each package's README for options.

## HTTP/2 & HTTP/3

`listen` takes an optional `ListenOptions` to pick the protocol — the same route
handlers serve every version (node:http2's compat API hands them the familiar
`req`/`res`):

```ts
app.listen(3000, () => {});                              // HTTP/1.1 (default)
app.listen(3000, { http2: true, key, cert }, () => {});  // h2 over TLS, +HTTP/1.1 ALPN fallback
app.listen(3000, { http2: "h2c" }, () => {});            // cleartext h2 (no TLS; not for browsers)
app.listen(3000, { http3: true, key, cert }, () => {});  // HTTP/3 — see note
```

- **`http2: true`** negotiates `h2` via ALPN over TLS and keeps HTTP/1.1 as a
  fallback on the same port (disable with `allowHTTP1: false`). Needs `key` +
  `cert` (PEM).
- **`http2: "h2c"`** is prior-knowledge cleartext h2 — handy behind a proxy or
  service-to-service; browsers won't use it.
- **`http3: true`** throws today: no JS runtime ships a stable HTTP/3 *server*
  API. In production terminate HTTP/3 at a proxy that speaks it (Caddy,
  nginx-quic, Cloudflare) and let it forward to this server over HTTP/2 — your
  code is unchanged. The flag exists so call sites are ready when a runtime API
  lands.

> WebSocket upgrades ride HTTP/1.1, so `app.ws(...)` works on HTTP/1.1 and on
> `http2: true` (via the ALPN fallback), but not on pure `h2c`.

### Defending against HTTP/2 DoS (`http2Guard`)

HTTP/2 multiplexes many cheap streams over one connection, which a few DoS
patterns abuse — all below the request layer. `http2Guard()` instruments each
`Http2Session` and tears down (GOAWAY + destroy) connections that cross a
threshold. Register it globally so it sees every connection's first request:

```ts
app.use(http2Guard({
  maxConcurrentStreams: 100,   // open-at-once cap per connection
  maxResetsPerWindow: 100,     // RST_STREAM flood (Rapid Reset, CVE-2023-44487)
  windowMs: 10_000,            // sliding window for the reset count
  maxStreamsPerSession: 0,     // lifetime stream cap (0 = unlimited)
  onAbuse: (info) => log.warn("h2 abuse", info),
}));
```

It's a no-op on HTTP/1.1. It covers **Rapid Reset**, **concurrent-stream
floods** and **stream churn** — the request-observable vectors. Header-assembly
attacks (CONTINUATION flood, CVE-2024-27316) and HPACK memory happen before a
request exists; cap those with Node's `maxSessionMemory` / `maxHeaderListSize`
http2 server settings and a current Node, not a middleware.

## Examples

```bash
pnpm examples:server   # controllers, guards, middleware, docs
pnpm examples:cache    # compiled-serializer response cache
pnpm examples:upload   # multipart uploads
```
