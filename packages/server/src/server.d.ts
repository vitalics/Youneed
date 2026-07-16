import { Buffer } from "node:buffer";
import { Server, IncomingMessage, ServerResponse, OutgoingHttpHeaders } from "node:http";
import type { Http2Server, Http2SecureServer } from "node:http2";
import type { MaybePromise } from "@youneed/core";
export type HttpRequest = IncomingMessage & {
    body?: any;
    params?: Record<string, string>;
    query?: Record<string, string>;
};
/**
 * HTTP Response type for route handlers — node:http's ServerResponse.
 */
export type HttpResponse = ServerResponse;
/**
 * Elysia-style handler: it receives a single `Context` and *returns* a value
 * that the framework serializes. `ctx.response` is there for manual streaming.
 */
type HttpHandler = (ctx: Context) => MaybePromise<unknown>;
declare const RESULT: unique symbol;
declare const OWNS_STREAM: unique symbol;
interface HttpResult {
    readonly [RESULT]: true;
    readonly [OWNS_STREAM]?: true;
    status: number;
    headers: OutgoingHttpHeaders;
    body: unknown;
}
declare function isResult(value: unknown): value is HttpResult;
declare function Response(opts?: {
    status?: number;
    headers?: OutgoingHttpHeaders;
    body?: unknown;
}): HttpResult;
declare namespace Response {
    var json: (body: unknown, opts?: BodyOpts) => HttpResult;
    var text: (body: unknown, opts?: BodyOpts) => HttpResult;
}
type BodyOpts = {
    status?: number;
    headers?: OutgoingHttpHeaders;
};
/**
 * `Cache-Control` response directives (MDN). Booleans emit the bare token when
 * `true`; numbers emit `name=<seconds>`. Order is normalized for readability.
 */
interface CacheControl {
    /** Cacheable by any cache (CDNs/proxies included). */
    public?: boolean;
    /** Cacheable only by the browser, not shared caches. */
    private?: boolean;
    /** Store but revalidate with the origin before reuse. */
    noCache?: boolean;
    /** Never store this response anywhere. */
    noStore?: boolean;
    /** Caches/proxies must not transform the body. */
    noTransform?: boolean;
    /** Once stale, must revalidate (no serving stale on error). */
    mustRevalidate?: boolean;
    /** Like must-revalidate, but only for shared caches. */
    proxyRevalidate?: boolean;
    /** Cache only if the cache understands the status code (with no-store fallback). */
    mustUnderstand?: boolean;
    /** The body won't change for `max-age` — skip revalidation entirely. */
    immutable?: boolean;
    /** Fresh lifetime for any cache, in seconds (`max-age`). */
    maxAge?: number;
    /** Fresh lifetime for SHARED caches, in seconds (`s-maxage`); overrides max-age there. */
    sMaxage?: number;
    /** Seconds a stale response may be served while it revalidates in the background. */
    staleWhileRevalidate?: number;
    /** Seconds a stale response may be served if revalidation errors. */
    staleIfError?: number;
}
/** Serialize {@link CacheControl} directives into a `Cache-Control` header value. */
declare function cacheControl(d: CacheControl): string;
/** `Clear-Site-Data` directives (MDN) — tell the browser to drop cached data for
 *  this origin. This is the one server-driven way to "invalidate" a client cache
 *  governed by `Cache-Control` (you can't otherwise reach into it after the fact).
 *  Honored only over HTTPS. */
type ClearSiteDataDirective = "cache" | "cookies" | "storage" | "executionContexts" | "clientHints" | "*";
/**
 * Build a `Clear-Site-Data` header value (each directive is a quoted-string).
 * No args → `"*"` (clear everything). Set it on a response — e.g. on logout or
 * after a deploy — to make the browser purge `Cache-Control`-cached resources:
 *
 *   Response.json({ ok: true }, { headers: { "Clear-Site-Data": clearSiteData("cache") } });
 *   // → Clear-Site-Data: "cache"
 */
declare function clearSiteData(...types: ClearSiteDataDirective[]): string;
interface FileOptions {
    status?: number;
    headers?: OutgoingHttpHeaders;
    /** `Cache-Control` for this file — a raw header string, or {@link CacheControl}
     *  directives serialized for you. An explicit `headers["Cache-Control"]` wins. */
    cacheControl?: string | CacheControl;
}
declare function File(path: string, opts?: FileOptions): HttpResult;
declare class HttpError extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(status: number, payload: unknown);
}
interface Issue {
    path: string;
    message: string;
}
declare class ValidationError extends HttpError {
    readonly issues: Issue[];
    /** Default 422; pass another code to honour the "any status" invariant. */
    constructor(issues: Issue[], status?: number);
}
interface Schema<T = unknown> {
    /** Validate (and coerce) `value`, pushing problems into `issues`. */
    _check(value: unknown, path: string, issues: Issue[]): T;
    /**
     * Format-agnostic serialization (mirrors Symbol.toPrimitive). `value` is the
     * thing to serialize; when omitted, the schema describes its own shape for
     * `kind` (JSON Schema for "json", an XSD fragment for "xml", and so on).
     */
    [Symbol.toSerialize]?(value: unknown, kind: SerializeKind): unknown;
    /** Marker used by `t.object` to allow a missing property. */
    optional?: boolean;
    /** zod-style: attach metadata, returning a new schema (chainable). */
    meta(metadata: SchemaMeta): Schema<T>;
    /** Accumulated metadata (title/description/examples + custom keys). */
    _meta?: SchemaMeta;
}
interface SchemaMeta {
    title?: string;
    description?: string;
    example?: unknown;
    examples?: unknown[];
    /** custom keys are allowed (e.g. a FIX tag number) */
    [key: string]: unknown;
}
/** A loose JSON Schema fragment — enough for spec generation. */
type JsonSchema = Record<string, any>;
declare global {
    interface SymbolConstructor {
        readonly toSerialize: unique symbol;
        readonly dispose: unique symbol;
        readonly asyncDispose: unique symbol;
    }
}
/** Open string union — built-ins plus any custom format. */
type SerializeKind = "json" | "xml" | "fix" | (string & {});
/** Describe a schema in the given format (default JSON Schema, for OpenAPI). */
declare function toJsonSchema(schema: Schema, kind?: SerializeKind): JsonSchema;
type Infer<S> = S extends Schema<infer T> ? T : never;
declare function isSchema(value: unknown): value is Schema;
/** Run a schema against a value; throws ValidationError if anything failed. */
declare function validate<T>(schema: Schema<T>, value: unknown, status?: number): T;
declare const t: {
    string(): Schema<string>;
    number(): Schema<number>;
    boolean(): Schema<boolean>;
    literal<L extends string | number | boolean>(lit: L): Schema<L>;
    optional<S extends Schema>(inner: S): Schema<Infer<S> | undefined>;
    array<S extends Schema>(inner: S): Schema<Infer<S>[]>;
    union<S extends Schema>(...options: S[]): Schema<Infer<S>>;
    object<P extends Record<string, Schema>>(props: P): Schema<{ [K in keyof P]: Infer<P[K]>; }>;
    any(): Schema;
};
interface RouteSchema {
    params?: Schema;
    query?: Schema;
    /** A body schema, or `false` to opt OUT of body buffering entirely — the core
     *  won't drain the request, so the handler can consume `ctx.request` as a raw
     *  stream (file uploads via `@youneed/server-middleware-upload`, proxying…). */
    body?: Schema | false;
    /** A single schema (applied to 200) or a per-status-code map. */
    response?: Schema | Record<number, Schema>;
    /** Status code used when input validation fails (default 422). */
    invalidStatus?: number;
}
type FieldType<Sch, K extends keyof RouteSchema, Fallback> = Sch extends {
    [P in K]: infer V;
} ? V extends Schema ? Infer<V> : Fallback : Fallback;
/**
 * The single argument every HTTP handler receives. `params`/`query`/`body`
 * are inferred from the route schema; the raw `request`/`response` remain for
 * advanced use (manual streaming, SSE). Default `Context` (no generic) is what
 * decorator handlers annotate, since decorators can't infer per-route types.
 */
/**
 * The shape you ASSIGN to `ctx.meta` — name + human description, plus any extra
 * keys. (`done` is added by the framework on read; you never provide it.)
 */
interface ContextMetaInit {
    name?: string;
    description?: string;
    [key: string]: unknown;
}
/**
 * Self-describing metadata a guard/interceptor (or handler) attaches to the
 * request. Unlike `state` (opaque scratch data), `meta` is *descriptive*: it
 * surfaces in logs and is harvested into the generated OpenAPI document (see
 * `AppBuilder.openapi`). The read shape adds `done()`.
 *
 *   const requireAuth = (ctx: Context) => {
 *     ctx.meta = { name: "require auth", description: "Bearer token in Authorization" };
 *     ctx.meta.done();   // documentation declared — stops here during harvesting,
 *                        // a no-op on a real request
 *     if (!ctx.request.headers.authorization) throw new HttpError(401, …);
 *     return true;
 *   };
 */
interface ContextMeta extends ContextMetaInit {
    /** Mark the metadata declaration complete. During the OpenAPI documentation
     *  pass this stops the annotator right here (so its real I/O never runs); on a
     *  normal request it's a no-op and execution continues. */
    done(): void;
}
interface Context<Sch extends RouteSchema = {}> {
    request: HttpRequest;
    response: HttpResponse;
    params: FieldType<Sch, "params", Record<string, string>>;
    query: FieldType<Sch, "query", Record<string, string>>;
    body: FieldType<Sch, "body", unknown>;
    /** Correlation id — from `x-request-id` or generated; echoed in the response. */
    requestId: string;
    /** Per-request scratch bag for middleware (auth principal, etc.) — like res.locals. */
    state: Record<string, unknown>;
    /** Self-describing metadata (name/description) — feeds logs + the OpenAPI doc.
     *  Pre-initialized, so both `ctx.meta.name = …` and `ctx.meta = {…}` work; call
     *  `ctx.meta.done()` to mark the declaration complete. */
    get meta(): ContextMeta;
    set meta(value: ContextMetaInit);
    /** `true` only during documentation harvesting (an introspection pass, not a
     *  real request). `ctx.meta.done()` keys off this. */
    describing?: boolean;
    /** Typed cookie access — reads `Cookie`, writes `Set-Cookie`. Built lazily. */
    readonly cookies: CookieJar;
}
/** Ambient access to the in-flight request context (survives `await`). */
declare function context(): Context | undefined;
/** Request-scoped log line — picks up the requestId from async context. */
declare function trace(message: string): void;
interface CookieOptions {
    maxAge?: number;
    expires?: Date;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
}
/** Lazy cookie jar: parses `Cookie` on first read, writes `Set-Cookie` on set. */
declare class CookieJar {
    #private;
    constructor(req: HttpRequest, res: HttpResponse);
    get(name: string): string | undefined;
    all(): Record<string, string>;
    set(name: string, value: string, opts?: CookieOptions): void;
    /** Expire a cookie now (same path/domain it was set with). */
    delete(name: string, opts?: Pick<CookieOptions, "path" | "domain">): void;
}
type Next = () => Promise<unknown>;
type Middleware = (ctx: Context, next: Next) => MaybePromise<unknown>;
/** The verdict of running one guard during {@link AppBuilder.tryGuards}. */
interface GuardTrial {
    name: string;
    outcome: "passed" | "denied" | "error" | "skipped";
    status?: number;
    message?: string;
}
interface CacheOptions {
    /** Time-to-live in milliseconds (default 30s). */
    ttl?: number;
    /** Max entries kept; oldest evicted past this (default 1000). */
    max?: number;
    /** Cache key from the request (default `METHOD url`). */
    key?: (ctx: Context) => string;
    /**
     * Request coalescing / single-flight (default true): when several requests
     * miss the same key concurrently, run the handler once and share the result
     * with the waiters, instead of stampeding the origin (the "dogpile" problem).
     */
    coalesce?: boolean;
    /**
     * Stale-while-revalidate window (ms, default 0 = off): once an entry expires,
     * keep serving the *stale* copy for this long while a single background
     * refresh recomputes it — so a repeat request is never blocked on the origin.
     */
    staleWhileRevalidate?: number;
    /**
     * Response compilation (default false): cache the *serialized bytes* of the
     * response, not just the value. A hit then replays the precomputed buffer —
     * skipping the handler AND serialization — the fastest path for hot,
     * unchanging payloads. Streaming/file responses are never compiled.
     */
    compile?: boolean;
}
interface Cache {
    /** The middleware to register via `app.use(cache.middleware())`. */
    middleware(): Middleware;
    /** Drop one entry, or every entry whose key matches a predicate/RegExp. */
    invalidate(target: string | RegExp | ((key: string) => boolean)): number;
    /** Drop everything. */
    clear(): void;
    readonly size: number;
    /** Entries currently being computed (coalesced in-flight). */
    readonly inflight: number;
}
/** In-memory response cache: TTL, LRU-ish cap, coalescing, stale-while-revalidate,
 * optional response compilation, and flexible invalidation. */
declare function createCache(opts?: CacheOptions): Cache;
/** Minimal async key-value backend the distributed cache needs. `@youneed/kv`'s
 *  `KV` (MemoryKV / RedisKV) satisfies this structurally — so core stays dep-free
 *  and any compatible store plugs in. */
interface CacheStore {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string, opts?: {
        ttl?: number;
    }): Promise<void>;
    delete(key: string): Promise<void>;
    /** List keys by prefix — required for RegExp/predicate `invalidate`, `clear`,
     *  and `size`. Stores that can't scan cheaply may omit it (those ops then throw). */
    scan?(prefix: string): Promise<string[]>;
}
interface DistributedCacheOptions {
    /** The shared backend (e.g. `redisKV(...)` from `@youneed/kv-redis`). Required. */
    store: CacheStore;
    /** Fresh TTL in ms (default 30s). */
    ttl?: number;
    /** Stale-while-revalidate window in ms (default 0 = off): keep serving the stale
     *  copy this long after expiry while one background refresh recomputes it. */
    staleWhileRevalidate?: number;
    /** Cache key from the request (default `METHOD url`). */
    key?: (ctx: Context) => string;
    /** Per-node single-flight on concurrent misses (default true). */
    coalesce?: boolean;
    /** Key prefix in the store (default `"cache:"`). Lets several caches share a backend. */
    prefix?: string;
}
interface DistributedCache {
    /** The middleware to register via `app.use(cache.middleware())`. */
    middleware(): Middleware;
    /** Drop one key (string), or every key matching a RegExp/predicate (needs
     *  `store.scan`). Returns the number removed. */
    invalidate(target: string | RegExp | ((key: string) => boolean)): Promise<number>;
    /** Drop every entry under the prefix (needs `store.scan`). */
    clear(): Promise<void>;
    /** Entries currently under the prefix (needs `store.scan`). */
    size(): Promise<number>;
    /** Misses currently coalesced in-flight on THIS node. */
    readonly inflight: number;
}
/** Shared response cache backed by a distributed `CacheStore` (see `@youneed/kv`).
 *  Freshness + the stale window are carried in the stored payload; LRU/eviction is
 *  delegated to the backend (e.g. Redis `maxmemory`) plus the per-key TTL.
 *  Coalescing and background revalidation are per-node. */
declare function createDistributedCache(opts: DistributedCacheOptions): DistributedCache;
declare function appendVary(res: HttpResponse, value: string): string;
type TypedHandler<Sch extends RouteSchema> = (ctx: Context<Sch>) => MaybePromise<unknown>;
/**
 * A guard runs before the handler, inside the request's async context (so it
 * can use `trace`/`context` and the already-validated `ctx`). Return `false`
 * to reject with 403, throw an `HttpError` for any other status, or return
 * `true`/`undefined` to let the request through.
 */
type Guard = (ctx: Context) => MaybePromise<boolean | void>;
type Annotator = (ctx: Context, ...rest: any[]) => unknown;
/**
 * Wrap a guard (or interceptor/middleware) with OPTIONAL OpenAPI documentation
 * metadata, so you don't hand-write `ctx.meta = {…}; ctx.meta.done()` inside it.
 * The function comes first; `doc` is an optional second argument. On a real
 * request the wrapper just runs `fn`; during the documentation-harvest pass it
 * declares `{ name, description, … }` and stops before `fn`'s I/O — exactly what
 * surfaces in the generated OpenAPI (`x-guards` + the operation description).
 * Omit `doc` and `fn` is returned unchanged (nothing to document).
 *
 *   const requireAuth = guardWithDocumentation(
 *     (ctx) => { if (!ctx.request.headers.authorization) throw new HttpError(401, { error: "Unauthorized" }); return true; },
 *     { name: "auth", description: "Bearer token in the Authorization header" },
 *   );
 *   // or wrap an existing guard inline:
 *   @Controller.guard(withDocumentation(ownsRecord, { name: "owner", description: "must own the record" }))
 */
declare function withDocumentation<F extends Annotator>(fn: F, doc?: ContextMetaInit): F;
/** {@link withDocumentation} typed for a {@link Guard}. */
declare function guardWithDocumentation(guard: Guard, doc?: ContextMetaInit): Guard;
/**
 * An interceptor wraps a handler: it runs code BEFORE and AFTER, can short-circuit
 * (skip the handler) and — unlike a {@link Guard}, which is a pre-check that only
 * allows/denies — can transform the RESULT as the chain unwinds (envelope, timing,
 * caching, mapping). It's exactly a {@link Middleware}, but attached per-controller
 * / per-handler by decorator instead of by URL prefix.
 */
type Interceptor = Middleware;
declare function guard(...guards: Guard[]): (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
declare function intercept(...interceptors: Interceptor[]): (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
declare function middleware(...mws: Middleware[]): (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
/** Minimal structural logger (so core needn't depend on `@youneed/logger`; its
 *  `Logger` satisfies this). What `Controller.prototype.log` returns. */
interface RequestLogger {
    error(message: unknown, meta?: Record<string, unknown>): unknown;
    warn(message: unknown, meta?: Record<string, unknown>): unknown;
    info(message: unknown, meta?: Record<string, unknown>): unknown;
    debug(message: unknown, meta?: Record<string, unknown>): unknown;
    [key: string]: unknown;
}
declare class ControllerInternal {
    /** Base path shared by every route of the controller. */
    static basePath: string;
    /** Guards applied to every route of the controller (run before per-method ones). */
    static guards: Guard[];
    /** Interceptors wrapping every route of the controller (outermost; before the
     *  per-method ones, which wrap the handler more closely). */
    static interceptors: Interceptor[];
    /** Middleware applied to every route of the controller. Runs OUTSIDE guards
     *  (Express-style), before the per-method `@Controller.middleware` ones. */
    static middlewares: Middleware[];
    /** Providers installed once on the controller instance at mount — they add
     *  PRIVATE members under a namespace (e.g. `this.orm`). Unlike guards/middleware
     *  (which only gate/transform a request), a provider extends the instance. */
    static providers: ControllerProvider[];
    /**
     * Descriptor factory, callable + `.json` / `.text` shortcuts:
     *   this.Response({ status, headers, body })
     *   this.Response.json(value, { status })
     *   this.Response.text(str, { status })
     */
    Response: typeof Response;
    /** The in-flight request context (via async-local storage); `undefined` outside
     *  a request. Lets a controller method read `this.ctx` instead of taking `ctx`. */
    get ctx(): Context | undefined;
    /** The request-scoped logger set by `@youneed/server-middleware-logger`
     *  (`ctx.state.logger`), so a controller method can `this.log.info(...)` and the
     *  line carries requestId/traceId. Falls back to `console` when not installed. */
    get log(): RequestLogger;
    static decorators: {
        get: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        post: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        put: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        patch: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        delete: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        query: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        guard: typeof guard;
        intercept: typeof intercept;
        middleware: typeof middleware;
    };
}
type ControllerClass = typeof ControllerInternal;
/**
 * A controller provider — installs PRIVATE members onto a controller instance at
 * mount (like a `@youneed/dom` component provider). Differs from guards/middleware:
 * those only gate or transform a request; a provider adds an instance member (e.g.
 * `this.orm`). The `Contributes` phantom is folded into the controller's instance
 * type by {@link Controller}, so the added members are typed inside the class.
 *
 *   const orm = await Orm({ … });
 *   class Users extends Controller("/users", {
 *     providers: [ormProvider(orm, { repositories: { users: getRepository(UsersTable) } })],
 *   }) {
 *     @Controller.get() async list() { return this.orm.users.count(); } // `this.orm` typed
 *   }
 */
export interface ControllerProvider<Contributes = {}> {
    /** Install onto a fresh controller instance (called once at mount). */
    install(instance: object): void;
    /** Phantom: the instance members this provider adds. Never read at runtime. */
    readonly __contributes?: Contributes;
}
type ContribOf<P> = P extends ControllerProvider<infer C> ? C : {};
type ProviderContributions<P extends readonly ControllerProvider[]> = P extends readonly [] ? {} : P extends readonly [infer H, ...infer T extends readonly ControllerProvider[]] ? ContribOf<H> & ProviderContributions<T> : {};
/** Object form of {@link Controller}: `Controller({ url, middlewares, guards, interceptors, providers })`. */
interface ControllerConfig<TProviders extends readonly ControllerProvider[] = readonly ControllerProvider[]> {
    /** Base path for every route (alias: `basePath`). */
    url?: string;
    basePath?: string;
    middlewares?: Middleware[];
    guards?: Guard[];
    interceptors?: Interceptor[];
    /** Providers that extend the controller instance with private members. */
    providers?: TProviders;
}
declare function Controller<const TProviders extends readonly ControllerProvider[] = readonly []>(basePathOrConfig?: string | ControllerConfig<TProviders>, opts?: {
    guards?: Guard[];
    interceptors?: Interceptor[];
    middlewares?: Middleware[];
    providers?: TProviders;
}): {
    new (): {
        /**
         * Descriptor factory, callable + `.json` / `.text` shortcuts:
         *   this.Response({ status, headers, body })
         *   this.Response.json(value, { status })
         *   this.Response.text(str, { status })
         */
        Response: typeof Response;
        /** The in-flight request context (via async-local storage); `undefined` outside
         *  a request. Lets a controller method read `this.ctx` instead of taking `ctx`. */
        get ctx(): Context | undefined;
        /** The request-scoped logger set by `@youneed/server-middleware-logger`
         *  (`ctx.state.logger`), so a controller method can `this.log.info(...)` and the
         *  line carries requestId/traceId. Falls back to `console` when not installed. */
        get log(): RequestLogger;
    };
    basePath: string;
    guards: Guard[];
    interceptors: Middleware[];
    middlewares: Middleware[];
    providers: ControllerProvider[];
    decorators: {
        get: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        post: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        put: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        patch: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        delete: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        query: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        guard: typeof guard;
        intercept: typeof intercept;
        middleware: typeof middleware;
    };
} & (abstract new (...args: any[]) => ProviderContributions<TProviders>);
declare namespace Controller {
    export var decorators: {
        get: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        post: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        put: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        patch: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        delete: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        query: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        guard: (...guards: Guard[]) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        intercept: (...interceptors: Interceptor[]) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
        middleware: (...mws: Middleware[]) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    };
    export var get: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var post: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var put: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var patch: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    var _a: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var query: (pathOrSchema?: string | RouteSchema, maybeSchema?: RouteSchema) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var guard: (...guards: Guard[]) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var intercept: (...interceptors: Interceptor[]) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export var middleware: (...mws: Middleware[]) => (_target: HttpHandler, ctx: ClassMethodDecoratorContext) => void;
    export { _a as delete };
}
interface WebSocketLike {
    send(data: string | Buffer): void;
    close(code?: number): void;
    readonly readyState: number;
}
interface WsHandlers {
    open?: (ws: WebSocketLike) => void;
    message?: (ws: WebSocketLike, message: string) => MaybePromise<unknown> | AsyncIterable<unknown>;
    close?: (ws: WebSocketLike) => void;
    /** Payload schemas — incoming (`message`) and outgoing (`response`). */
    schema?: {
        message?: Schema;
        response?: Schema;
    };
}
interface SseEvent {
    data: unknown;
    event?: string;
    id?: string;
    retry?: number;
}
interface SseHandlers {
    open?: (conn: SseConnection) => MaybePromise<unknown> | AsyncIterable<SseEvent | string>;
    close?: (conn: SseConnection) => void;
    /** Payload schema for the emitted events (for AsyncAPI). */
    schema?: {
        event?: Schema;
    };
}
declare class SseConnection {
    #private;
    constructor(res: HttpResponse);
    get closed(): boolean;
    send(event: SseEvent | string): void;
    close(): void;
}
interface SseRouteDef {
    path: string;
    handlers: SseHandlers;
}
/** Options for {@link HTTP.drain} / {@link HTTP.gracefulShutdown}. */
interface ShutdownOptions {
    /** Signals that trigger a graceful shutdown (default `["SIGTERM","SIGINT"]`). */
    signals?: NodeJS.Signals[];
    /** Max ms to wait for in-flight requests before force-closing (default `10000`). */
    timeout?: number;
    /** Run before draining — e.g. flip a readiness probe to failing. */
    onShutdown?: () => void | Promise<void>;
}
/** Any server we can `listen()` on — http(s) or http2, plain or secure. */
type ListenServer = Server | Http2Server | Http2SecureServer;
/**
 * How to listen. Default (no options) is HTTP/1.1, cleartext.
 *
 *   app.listen(3000, () => {})                                  // HTTP/1.1
 *   app.listen(3000, { http2: true, key, cert }, () => {})      // h2 over TLS (+ HTTP/1.1 ALPN fallback)
 *   app.listen(3000, { http2: "h2c" }, () => {})                // cleartext h2 (prior-knowledge; not for browsers)
 *   app.listen(3000, { http3: true, key, cert }, () => {})      // HTTP/3 — see note below
 */
export interface ListenOptions {
    /** Bind address (default: all interfaces). */
    host?: string;
    /**
     * Enable HTTP/2:
     *  • `true`  — h2 over TLS via ALPN (needs `key` + `cert`); HTTP/1.1 stays
     *    available as a fallback unless `allowHTTP1: false`.
     *  • `"h2c"` — cleartext h2 (prior-knowledge, no TLS). Browsers DON'T speak
     *    h2c; use it behind a proxy or for service-to-service.
     */
    http2?: boolean | "h2c";
    /**
     * Enable HTTP/3 (QUIC). No JS runtime currently ships a stable HTTP/3 *server*
     * API (Node has no `node:quic`/`node:http3`, Bun/Deno expose none), so this
     * throws with guidance. In production terminate HTTP/3 at a proxy that speaks
     * it (Caddy, nginx-quic, Cloudflare) and let it forward to this server over
     * h2/h1 — the app code is identical. The flag is here so call sites are ready.
     */
    http3?: boolean;
    /** TLS private key (PEM) — required for `http2: true` / `http3`. */
    key?: string | Buffer;
    /** TLS certificate (PEM) — required for `http2: true` / `http3`. */
    cert?: string | Buffer;
    /** Offer HTTP/1.1 alongside h2 over the same TLS port via ALPN (default true). */
    allowHTTP1?: boolean;
}
declare class HTTP {
    #private;
    protected server: ListenServer;
    constructor(server: ListenServer, onDispose?: () => Promise<void>);
    listen(port: number, cb: (ctx: HTTP) => void, host?: string): void;
    get port(): number | undefined;
    /** Stop accepting connections and resolve once the server has closed. */
    close(): Promise<void>;
    /**
     * Gracefully drain the server: run `onShutdown` (e.g. flip a readiness probe to
     * failing so a load balancer stops routing), stop accepting new connections,
     * drop IDLE keep-alive sockets, let in-flight requests finish — but force any
     * stragglers closed after `timeout` ms — then dispose controllers. Unlike
     * {@link close} (which closes everything at once), this waits for in-flight work.
     */
    drain(opts?: ShutdownOptions): Promise<void>;
    /**
     * Wire {@link drain} to process termination signals (default `SIGTERM`/`SIGINT`),
     * then `process.exit(0)` — zero-downtime shutdown for k8s/PM2/etc. Chainable:
     *   app.listen(3000, (s) => s.gracefulShutdown({ onShutdown: () => health.down() }));
     */
    gracefulShutdown(opts?: ShutdownOptions): this;
    /**
     * `await using server = app.listen(...)` (or a SIGINT handler) closes the
     * socket, then disposes every mounted controller in reverse order.
     */
    [Symbol.asyncDispose](): Promise<void>;
}
interface HttpRouteDef {
    method: string;
    path: string;
    handler: HttpHandler;
    schema?: RouteSchema;
    guards?: Guard[];
    interceptors?: Interceptor[];
    /** Controller-attached middleware (class + per-method). Runs outside guards. */
    middlewares?: Middleware[];
    /** Owning controller class name, when mounted via `Controller`. */
    controller?: string;
    /** Spec/doc routes hide themselves from generated documents. */
    hidden?: boolean;
    /** Guard/interceptor self-descriptions, harvested once for the OpenAPI doc. */
    meta?: ContextMeta[];
}
/** One route in the introspected {@link AppBuilder.topology} snapshot. */
interface RouteTopology {
    method: string;
    path: string;
    controller?: string;
    guards: number;
    /** Names of the route's guards (a guard's `doc` property, else its function
     *  name) — for documentation / the security audit. */
    guardNames: string[];
    /** Per-guard `{ name, description }` (from `withDocumentation`) — for the
     *  devtools guard detail view. Same order as `guardNames`. */
    guardDocs: {
        name: string;
        description?: string;
    }[];
    interceptors: number;
    kind: "http" | "ws" | "sse";
    schema?: {
        params?: JsonSchema;
        query?: JsonSchema;
        body?: JsonSchema;
        response?: JsonSchema;
    };
}
/** A serializable snapshot of an app's routes + middleware — for tooling such as
 *  `@youneed/server-devtools`. Produced by {@link AppBuilder.topology}. */
interface AppTopology {
    routes: RouteTopology[];
    /** Registered middleware names (best-effort from the function name). */
    middleware: string[];
    /** Mounted plugins (name + optional `inspect()` infra description). */
    plugins: PluginInfo[];
}
interface WsRouteDef {
    path: string;
    handlers: WsHandlers;
}
interface ApiRoutes {
    http: HttpRouteDef[];
    ws: WsRouteDef[];
    sse: SseRouteDef[];
}
type DocumentGenerator = (routes: ApiRoutes) => unknown;
interface DocInfo {
    title?: string;
    version?: string;
}
/**
 * A server plugin extends the app at lifecycle boundaries — instead of wrapping
 * the server from the outside up the call chain. Register with `app.plugin(...)`:
 *   - `setup(app)`      at registration — add middleware/routes/controllers, read config.
 *   - `beforeListen(i)` before binding; return `false` to TAKE OVER the bind
 *                       (e.g. a cluster primary forks workers instead of listening).
 *   - `onListen(http)`  once the server is listening — start background work (jobs, …).
 *   - `onShutdown()`    during graceful drain — stop background work (run LIFO).
 */
interface ServerPlugin {
    name: string;
    setup?(app: AppBuilder): void;
    beforeListen?(info: {
        port: number;
        opts: ListenOptions;
    }): boolean | void;
    onListen?(http: HTTP): void | Promise<void>;
    onShutdown?(): void | Promise<void>;
    /** Optional serializable description of the infrastructure this plugin wires
     *  (jobs, stores, workers…) — surfaced by `app.topology()` for the devtools
     *  Infra view. Keep it small and JSON-safe. */
    inspect?(): unknown;
}
/** A mounted plugin as seen by `app.topology()`. */
interface PluginInfo {
    name: string;
    info?: unknown;
}
declare class AppBuilder {
    #private;
    constructor(controllers: ControllerClass[]);
    /**
     * Register one or more {@link ServerPlugin}s. `setup` runs now (so a plugin can
     * add middleware/routes before the server is built); `onListen`/`onShutdown`
     * run when the server starts/drains.
     */
    plugin(...plugins: ServerPlugin[]): this;
    /**
     * Register middleware (Express-style, onion model). Two forms:
     *   `app.use(mw, …)`            — global: wraps routing, sees every request
     *                                 (404s, CORS preflight, rate-limit, logging).
     *   `app.use("/admin", mw, …)`  — scoped: runs only for routes under that path
     *                                 prefix (per-route / per-group middleware).
     * Runs in registration order; global wraps, scoped runs inside per matched route.
     */
    use(pathOrMw: string | Middleware, ...rest: Middleware[]): this;
    /** Mount a decorator-based controller class. */
    controller(Ctrl: ControllerClass): this;
    /**
     * Introspect the registered routes, controllers, middleware and ws/sse handlers
     * into a serializable snapshot — for tooling such as `@youneed/server-devtools`
     * (topology view, security audit, OpenAPI). Call it after the routes/controllers
     * are registered (before or after `listen`).
     */
    topology(): AppTopology;
    /**
     * Run the guards of one route against synthetic input (headers/params/query/body)
     * and report each guard's verdict — WITHOUT running the handler. Powers the
     * devtools "try a guard" panel. Guards run in order, stopping at the first that
     * denies (`return false` → `denied 403`) or throws (`HttpError` → `denied` with
     * its status, anything else → `error 500`); the rest are `skipped`.
     */
    tryGuards(method: string, path: string, init?: {
        headers?: Record<string, string>;
        params?: Record<string, string>;
        query?: Record<string, string>;
        body?: unknown;
    }): Promise<GuardTrial[]>;
    get<const Sch extends RouteSchema = {}>(path: string, handler: TypedHandler<Sch> | HttpResult, schema?: Sch): this;
    post<const Sch extends RouteSchema = {}>(path: string, handler: TypedHandler<Sch> | HttpResult, schema?: Sch): this;
    put<const Sch extends RouteSchema = {}>(path: string, handler: TypedHandler<Sch> | HttpResult, schema?: Sch): this;
    patch<const Sch extends RouteSchema = {}>(path: string, handler: TypedHandler<Sch> | HttpResult, schema?: Sch): this;
    delete<const Sch extends RouteSchema = {}>(path: string, handler: TypedHandler<Sch> | HttpResult, schema?: Sch): this;
    /** HTTP QUERY (safe, idempotent, body-carrying — RFC 9110-style). Use for
     *  reads whose query is too large/structured for the URL; responses are
     *  cacheable by content (see `createCache`). The query lives in `ctx.body`. */
    query<const Sch extends RouteSchema = {}>(path: string, handler: TypedHandler<Sch> | HttpResult, schema?: Sch): this;
    ws(path: string, handlers: WsHandlers): this;
    /** Server-Sent Events stream — same handler shape spirit as `.ws`. */
    sse(path: string, handlers: SseHandlers): this;
    /**
     * Mount any document generator at a GET path. The generator receives the
     * collected route metadata and returns a JSON-serializable spec. This is
     * the extension point — `.openapi()` / `.asyncapi()` are presets over it.
     */
    document(path: string, generate: DocumentGenerator): this;
    openapi(opts?: DocInfo & {
        path?: string;
    }): this;
    asyncapi(opts?: DocInfo & {
        path?: string;
    }): this;
    buildHTTP(opts?: ListenOptions): HTTP;
    listen(port: number, cb: (ctx: HTTP) => void): HTTP;
    listen(port: number, opts: ListenOptions, cb: (ctx: HTTP) => void): HTTP;
    /** `await using app = Application(...)` releases controllers on scope exit. */
    [Symbol.asyncDispose](): Promise<void>;
}
declare function Application(...controllers: ControllerClass[]): AppBuilder;
declare const BODY_LIMIT: unique symbol;
/**
 * The exact raw request-body bytes, memoized on the request. Safe to call from a
 * middleware AND have the handler still receive a parsed `ctx.body` — both share
 * the one drained buffer (no double-read of the consumed stream). Used by
 * signature-verifying middleware (`@youneed/server-middleware-webhook-signature`)
 * that must hash the bytes exactly as the client sent them.
 */
declare function rawBody(source: Context | HttpRequest): Promise<Buffer>;
interface MultipartFile {
    /** Field name from Content-Disposition. */
    name: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
}
interface MultipartBody {
    fields: Record<string, string>;
    files: MultipartFile[];
}
declare function contentTypeOf(kind: SerializeKind): string;
declare function negotiate(accept?: string): SerializeKind;
/** Handler that always responds in a fixed format, ignoring Accept. */
declare function respondAs(make: () => unknown, kind: SerializeKind): HttpHandler;
/** Variant 1: the value owns its representation; generic encoder otherwise. */
declare function serialize(value: unknown, kind: SerializeKind): string;
export { Application, Controller, withDocumentation, guardWithDocumentation, Response, File, cacheControl, clearSiteData, t, validate, isSchema, toJsonSchema, HttpError, ValidationError, context, trace, createCache, createDistributedCache, isResult, appendVary as vary, BODY_LIMIT, rawBody, serialize, negotiate, contentTypeOf, respondAs, };
export type { AppBuilder, AppTopology, RouteTopology, PluginInfo, GuardTrial, ControllerClass, ControllerConfig, RequestLogger, Context, ContextMeta, ContextMetaInit, ServerPlugin, Guard, TypedHandler, HttpHandler, HttpResult, FileOptions, CacheControl, ClearSiteDataDirective, RouteSchema, Schema, SchemaMeta, Infer, SerializeKind, ShutdownOptions, Issue, WsHandlers, SseHandlers, SseEvent, HTTP, Middleware, Interceptor, Next, CookieJar, CookieOptions, Cache, CacheOptions, CacheStore, DistributedCache, DistributedCacheOptions, MultipartBody, MultipartFile, };
