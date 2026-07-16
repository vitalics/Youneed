# Migrating to @youneed/server (from Express / Nest / Fastify / Bun / Elysia / tRPC)

@youneed/server = Node HTTP, `Controller` classes with `@Controller.get` decorators (or a
fluent builder), onion middleware, guards, interceptors, `t.*` schema validation,
value-returning handlers. Closest to Nest. See `references/server.md` for full API.

## Universal mappings (all sources)

- **Handler returns a value** → auto-JSON. Use `Response.json(body,{status})` / `File(path)`
  for control; `throw new HttpError(status, payload)` for errors. Don't write to `res`
  unless streaming.
- `req.params/query/body` → `ctx.params/query/body` (typed & coerced from the route schema).
- `req.headers` / `res.setHeader` → `ctx.request.headers` / `ctx.response.setHeader`.
- Validation: `t.object({ name: t.string() })` in the route schema (richer DTOs via `@youneed/schema`).
- Middleware: `app.use(mw)` / `app.use("/prefix", mw)` (onion, first = outermost).

## Express → @youneed/server

| Express | @youneed/server |
|---------|-----------------|
| `app.get("/u/:id",(req,res)=>res.json(u))` | `class U extends Controller("/u"){ @Controller.get("/:id") one(ctx){ return u; } }` |
| `app.use(fn)` / `app.use("/api",router)` | `app.use(mw)` / nested `Controller("/api")` |
| `res.status(404).json(x)` | `throw new HttpError(404,x)` or `response:{404:Schema}` |
| `res.sendFile(p)` | `return File(p,{cacheControl})` |
| error middleware `(err,req,res,next)` | `throw HttpError` + an interceptor/middleware that catches |
| `cors()/helmet()/morgan()` | `@youneed/server-middleware-{cors,helmet,request-logger}` |

## Nest → @youneed/server (closest)

| Nest | @youneed/server |
|------|-----------------|
| `@Controller("cats")` + `@Get(":id")` | `class Cats extends Controller("/cats"){ @Controller.get("/:id") ... }` |
| `@Param/@Query/@Body` | typed `ctx.params/query/body` via schema in the decorator |
| `@UseGuards(AuthGuard)` | `@Controller.guard(authFn)` or `Controller(path,{guards:[...]})` |
| Passport / Auth.js login, `@nestjs/passport` strategies | `@youneed/server-plugin-oauth2` (+ providers) / `server-plugin-otp` → see `references/auth.md` |
| `@nestjs/jwt` / `JwtAuthGuard` | `@youneed/server-middleware-jwt` (or `-bearer`/`-api-key`); guard `ctx.state.user` |
| `@UseInterceptors(x)` | `@Controller.intercept(fn)` or `{interceptors:[...]}` |
| `ValidationPipe` + DTO | `body: t.object({...})` (or `@youneed/schema` DTO) |
| `throw new HttpException(m,404)` | `throw new HttpError(404,{error:m})` |
| `@Injectable` + DI container | no decorator DI container — inject via constructor; share clients explicitly |
| `@nestjs/swagger` | `app.openapi({title,version})` (generated from schemas) |

Note: youneed has **no module/DI container** like Nest's `@Module`. Wire services through
constructors and a composition root (`main.ts`).

## Bun.serve / Elysia → @youneed/server

| Elysia | @youneed/server |
|--------|-----------------|
| `app.get("/u/:id",({params})=>...)` | `@Controller.get("/:id") one(ctx){ ctx.params.id }` |
| `ctx` (body/params/query/headers) | `Context` (same shape) |
| `.use(plugin)` | `app.use(middleware)` |
| `{ body: Schema }` (TypeBox) | `{ body: t.object({...}) }` (TypeBox-lite `t.*`) |
| `{ guard }` | `@Controller.guard(fn)` |
| `app.ws(path,{...})` | `app.ws(path,{ open,message,close,schema })` |
| `c.json(x)` | `return x` (auto-JSON) or `Response.json(x)` |

## tRPC → @youneed/server

tRPC's end-to-end inference becomes schema-typed routes (HTTP, not RPC envelope).

| tRPC | @youneed/server |
|------|-----------------|
| `t.procedure.input(S).query(...)` | `@Controller.get("/x",{ query:S, response:{200:O} })` |
| `z.object({...})` | `t.object({...})` (`.meta({...})` ≈ `.openapi`/`.describe`) |
| `inferProcedureOutput` | `Context<{ params; query; body; response }>` types the handler |
| `t.middleware(...)` | `app.use(mw)` / `@Controller.guard` |
| `throw new TRPCError({code})` | `throw new HttpError(status, payload)` |
| OpenAPI plugin | built-in `app.openapi({...})` |
| batching | not built-in; model as discrete endpoints |

Type-safe client: youneed exposes plain HTTP + an OpenAPI doc — generate a client from
the spec rather than importing the server's router type. Keep schemas authoritative so
request/response types and the generated client stay aligned.

## Migration tactics

1. **Lift schemas first** — translate Zod/TypeBox/DTOs to `t.*` (or `@youneed/schema`);
   they drive validation, the compiled serializer, and the OpenAPI doc.
2. **Map middleware to packages** — replace ad-hoc middleware with
   `@youneed/server-middleware-*` (see `references/middleware.md`); order them per the
   onion model.
3. **Controllers stay thin** — move business logic into plain services; the controller
   validates, calls the service, returns a value.
4. **Wire shutdown** — add `gracefulShutdown()` and `[Symbol.asyncDispose]` on resources
   so SIGTERM drains in-flight requests.
5. **Benchmark parity** — use `bench/load.mjs` (autocannon) to confirm RPS/p99 vs the old stack.
