# @youneed/server — Server Reference

Node HTTP server on TC39 decorators. Source of truth: `packages/server/src/server.ts`,
`packages/server/README.md`, examples in `examples/http`, `examples/crud`.

## Bootstrapping

```ts
import { Application, Controller, t } from "@youneed/server";

class Users extends Controller("/users") {
  @Controller.get() list() { return this.#users; }
  @Controller.get("/:id", { params: t.object({ id: t.string() }) })
  getOne(ctx) { return this.#users.find(u => u.id === ctx.params.id)
                  ?? Response.json({ error: "Not found" }, { status: 404 }); }
  @Controller.post({ body: User, response: { 201: User } })
  create(ctx) { this.#users.push(ctx.body); return Response.json(ctx.body, { status: 201 }); }
}

Application(Users)
  .use(/* middleware */)
  .listen(3000, ctx => console.log(ctx.port))
  .gracefulShutdown();
```

`Application(...controllers)` returns a builder. `.listen(port, cb, host?)` or
`.listen(port, opts, cb)`; `.buildHTTP(opts?)` returns an `HTTP` without listening.

## Routing

**Decorator style:** `Controller(basePath?, { guards?, interceptors? })`. Methods:
`@Controller.get/post/put/patch/delete/query(path?, schema?)`,
`@Controller.guard(...guards)`, `@Controller.intercept(...interceptors)`.
(`query` = RFC 9110 QUERY: safe, body-carrying.)

**Functional builder:** `app.get/post/put/patch/delete/query(path, handler, schema?)`,
plus `app.ws(path, handlers)` and `app.sse(path, handlers)` — all chainable.

Handler signature is `(ctx: Context) => value | Response | File | Promise<...>`.
Return a plain value → auto-serialized JSON. Static paths route O(1); dynamic
paths (`:param`) match per-method via a single regex.

## Request context

```ts
interface Context<Sch = {}> {
  request; response;                 // node:http req/res
  params; query; body;               // typed/coerced from the route schema
  requestId: string;                 // x-request-id or generated
  state: Record<string, unknown>;    // middleware scratch bag
  cookies: CookieJar;                // get/all/set(name,val,opts)/delete
}
```

`context()` recovers the current `Context` across `await` (AsyncLocalStorage);
`trace(msg)` logs correlated with `requestId`.

## Middleware, guards, interceptors

Onion model, all share `(ctx, next) => Promise<unknown>` except guards.

```
Global use() → Scoped use("/prefix") → Class guards → Method guards
            → Class interceptors → Method interceptors → Handler
```

- **Middleware** `app.use(mw)` or `app.use("/prefix", mw)`. First registered = outermost. `await next()` then transform/short-circuit. Global middleware sees 404s and CORS preflight.
- **Guard** `(ctx) => boolean | void`. `true`/`undefined` allow, `false` → 403, or `throw new HttpError(status, payload)`. Pre-gate only, cannot transform. Attach via `@Controller.guard(fn)` or `Controller(path, { guards: [...] })`.
- **Interceptor** `(ctx, next) => Promise<unknown>` — wraps the handler, can transform result/timing. Attach via `@Controller.intercept(fn)` or `{ interceptors: [...] }`.

## Responses

```ts
return value;                                   // auto-JSON
return Response.json(body, { status, headers });// also Response.text / Response(opts)
return File(path, { cacheControl: { maxAge: 3600, immutable: true } });
throw new HttpError(404, { error: "not found" });
```

Helpers: `cacheControl(directives)`, `clearSiteData(...types)`,
`respondAs(make, kind)` (force a format), `negotiate(accept)`, `serialize(value, kind)`.
Custom serialization via `value[Symbol.toSerialize](value, kind)`. Response schemas
compile to a fixed-field serializer (no per-request property enumeration).

## Schema & validation

`t.string/number/boolean/literal/optional/array/union/object/any`; `.meta({...})` chains
metadata. `number`/`boolean` coerce strings. `RouteSchema = { params?, query?, body?,
response?: Schema | Record<number, Schema>, invalidStatus? }` (default 422). `validate(schema,
value, status?)`, `toJsonSchema(schema)` (feeds `.openapi()`/`.asyncapi()`). For richer
DTOs (class-validator style on decorators) see `@youneed/schema`.

## WebSocket & SSE

```ts
app.ws("/chat", { open(ws){}, message(ws,msg){ ws.send("echo:"+msg); }, close(ws){},
                  schema: { message: t.string(), response: t.string() } });
app.sse("/notes", { async *open(conn){ yield { event:"tick", id:"1", data:{n:1} }; } });
```

`message` may be an async generator (streamed). SSE `open` may yield `SseEvent | string`.

## Caching

```ts
import { createCache, createDistributedCache } from "@youneed/server";
const cache = createCache({ ttl: 5000, max: 1000, staleWhileRevalidate: 30_000, compile: true });
app.use("/reports", cache.middleware());
cache.invalidate("GET /report");               // string | RegExp | predicate
```

`createDistributedCache({ store, ttl, staleWhileRevalidate, prefix })` takes an async
`CacheStore` (e.g. `redisKV` from `@youneed/kv-redis`) for cross-node caching/sessions/rate-limit.
`x-cache` header: `HIT | STALE | MISS | COALESCED`.

## HTTP/2 & HTTP/3

`listen(port, opts, cb)` with `ListenOptions`:
`{ http2?: true | "h2c", key, cert, allowHTTP1?, http3? }`. `http2: true` = h2 over TLS
(ALPN fallback to HTTP/1.1); `"h2c"` = cleartext h2 for service-to-service.
`http3: true` **throws** — no stable server API in JS runtimes; front with a proxy.
Defend h2 with `@youneed/server-middleware-http2-guard`.

## Graceful shutdown

```ts
server.gracefulShutdown({ signals: ["SIGTERM","SIGINT"], timeout: 10_000, onShutdown });
await server.drain({ timeout: 10_000 });        // explicit
await using http = app.listen(3000, () => {});  // scope-based dispose
```

`drain` sweeps idle connections repeatedly then force-closes at the deadline. Controllers
with `[Symbol.asyncDispose]`/`[Symbol.dispose]` are disposed on drain.

## API docs

`app.openapi({ title, version, path })`, `app.asyncapi({...})`, or
`app.document(path, routes => spec)` — generated lazily from route metadata/schemas.

## Server-Timing & Keep-Alive helpers

From the middleware packages (see `references/middleware.md`):
`timing(ctx).start/add/measure` writes `Server-Timing`; `connection(ctx).close()/destroy()`
controls the socket.
