import { createReadStream } from "node:fs";
import { Buffer } from "node:buffer";
import { extname } from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";
import { Server, } from "node:http";
import { createServer as createHttp2Cleartext, createSecureServer as createHttp2Secure, } from "node:http2";
import { createRegistry, ctorOf } from "@youneed/core";
// ============================================================
// Response descriptors (the value a handler returns)
// ------------------------------------------------------------
// `Response()` and `File()` build a protocol-neutral descriptor. The
// transport decides how to put it on the wire, so the same handler shape
// can later feed a WS or CLI transport.
// ============================================================
const RESULT = Symbol("framework.result");
// Marks a result that owns a re-openable stream body (see `File`). Lets caches
// recognize "don't replay this" without *reading* `body` — reading it would
// open a fresh file descriptor just to type-check it.
const OWNS_STREAM = Symbol("framework.ownsStream");
function isResult(value) {
    return (typeof value === "object" && value !== null && value[RESULT] === true);
}
function Response(opts) {
    return {
        [RESULT]: true,
        status: opts?.status ?? 200,
        headers: opts?.headers ?? {},
        body: opts?.body,
    };
}
/** Send a JSON payload without boilerplate: `Response.json(value, { status })`. */
Response.json = (body, opts) => Response({
    status: opts?.status,
    headers: { "Content-Type": "application/json", ...opts?.headers },
    body, // kept as a value so output validation can inspect it; serialized in sendBody
});
/** Send a plain-text payload without boilerplate: `Response.text(str, { status })`. */
Response.text = (body, opts) => Response({
    status: opts?.status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...opts?.headers },
    body: String(body),
});
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".js": "text/javascript",
    ".ts": "text/plain; charset=utf-8",
    ".css": "text/css",
    ".txt": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
};
/** Serialize {@link CacheControl} directives into a `Cache-Control` header value. */
function cacheControl(d) {
    const parts = [];
    if (d.public)
        parts.push("public");
    if (d.private)
        parts.push("private");
    if (d.noCache)
        parts.push("no-cache");
    if (d.noStore)
        parts.push("no-store");
    if (d.noTransform)
        parts.push("no-transform");
    if (d.mustRevalidate)
        parts.push("must-revalidate");
    if (d.proxyRevalidate)
        parts.push("proxy-revalidate");
    if (d.mustUnderstand)
        parts.push("must-understand");
    if (d.immutable)
        parts.push("immutable");
    if (d.maxAge !== undefined)
        parts.push(`max-age=${d.maxAge}`);
    if (d.sMaxage !== undefined)
        parts.push(`s-maxage=${d.sMaxage}`);
    if (d.staleWhileRevalidate !== undefined)
        parts.push(`stale-while-revalidate=${d.staleWhileRevalidate}`);
    if (d.staleIfError !== undefined)
        parts.push(`stale-if-error=${d.staleIfError}`);
    return parts.join(", ");
}
/**
 * Build a `Clear-Site-Data` header value (each directive is a quoted-string).
 * No args → `"*"` (clear everything). Set it on a response — e.g. on logout or
 * after a deploy — to make the browser purge `Cache-Control`-cached resources:
 *
 *   Response.json({ ok: true }, { headers: { "Clear-Site-Data": clearSiteData("cache") } });
 *   // → Clear-Site-Data: "cache"
 */
function clearSiteData(...types) {
    return (types.length ? types : ["*"]).map((t) => `"${t}"`).join(", ");
}
function File(path, opts) {
    const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
    const cc = opts?.cacheControl;
    const cacheHeader = cc === undefined ? undefined : typeof cc === "string" ? cc : cacheControl(cc);
    // A bare `File(...)` can be registered as a CONSTANT route — the server reuses
    // the single descriptor for every request. A baked-in `createReadStream` would
    // be exhausted after the first response (the next request streams 0 bytes), so
    // expose `body` as a getter that opens a FRESH stream on each read. Every
    // request — including concurrent ones — gets its own, while `() => File(...)`
    // keeps working too. `set body` honors the output-validation write-back path.
    let override;
    let overridden = false;
    return {
        [RESULT]: true,
        [OWNS_STREAM]: true,
        status: opts?.status ?? 200,
        headers: {
            "Content-Type": type,
            ...(cacheHeader !== undefined ? { "Cache-Control": cacheHeader } : {}),
            ...opts?.headers,
        },
        get body() {
            return overridden ? override : createReadStream(path);
        },
        set body(v) {
            override = v;
            overridden = true;
        },
    };
}
// Anything with an (async) iterator that isn't a string/array — i.e. a
// generator or stream-like source we should stream chunk by chunk.
function isStreamable(value) {
    return (value != null &&
        (typeof value[Symbol.asyncIterator] === "function" ||
            (typeof value.next === "function" &&
                typeof value[Symbol.iterator] === "function")));
}
// ============================================================
// Response serialization
// ============================================================
// `send`/`sendBody` are deliberately *not* `async`: the common cases (object,
// string, buffer) finish synchronously and return `undefined`, so the hot path
// pays no extra promise/microtask. Only streaming bodies return a Promise —
// callers do `const p = send(...); if (p) await p;`.
function send(res, value, kind = "json", serializer) {
    if (res.writableEnded)
        return; // handler already wrote manually
    if (isResult(value)) {
        res.statusCode = value.status;
        const headers = value.headers;
        // Capture the declared Content-Type while iterating, so sendBody doesn't
        // have to call res.getHeader() back out again on the hot path.
        let ct;
        for (const key in headers) {
            const val = headers[key];
            if (val !== undefined) {
                res.setHeader(key, val);
                if (key.length === 12 && key.toLowerCase() === "content-type")
                    ct = String(val);
            }
        }
        return sendBody(res, value.body, kind, serializer, ct);
    }
    return sendBody(res, value, kind, serializer);
}
function sendBody(res, body, kind, serializer, ctHint) {
    if (body === undefined || body === null) {
        if (res.statusCode === 200)
            res.statusCode = 204;
        res.end();
        return;
    }
    if (Buffer.isBuffer(body)) {
        setDefaultType(res, "application/octet-stream");
        res.end(body);
        return;
    }
    if (body instanceof Readable) {
        setDefaultType(res, "application/octet-stream");
        return pipeStream(res, body);
    }
    if (isStreamable(body)) {
        setDefaultType(res, "text/plain; charset=utf-8");
        return streamIterable(res, body);
    }
    // An explicit content-type (Response.json / Response.text) wins — the handler
    // asked for a specific format. `ctHint` avoids a getHeader() round-trip.
    const explicit = ctHint ?? String(res.getHeader("Content-Type") ?? "");
    if (explicit.includes("application/json")) {
        res.end(serializer ? serializer(body) : JSON.stringify(body));
        return;
    }
    if (typeof body === "string") {
        setDefaultType(res, "text/plain; charset=utf-8");
        res.end(body);
        return;
    }
    // No explicit type: serialize by the negotiated kind. A compiled serializer
    // wins for JSON; value-owned (Symbol.toSerialize) next; else generic encoder.
    if (kind === "json" && serializer) {
        setDefaultType(res, "application/json");
        res.end(serializer(body));
        return;
    }
    setDefaultType(res, contentTypeOf(kind));
    res.end(serialize(body, kind));
}
// The two streaming tails, split out so `sendBody` itself stays synchronous.
function pipeStream(res, body) {
    return new Promise((resolve, reject) => {
        body.on("error", reject);
        res.on("close", resolve);
        body.pipe(res);
    });
}
async function streamIterable(res, body) {
    for await (const chunk of body) {
        res.write(typeof chunk === "string" || Buffer.isBuffer(chunk) ? chunk : JSON.stringify(chunk));
    }
    res.end();
}
function setDefaultType(res, type) {
    if (!res.hasHeader("Content-Type"))
        res.setHeader("Content-Type", type);
}
// ============================================================
// Errors — any handler/validator may throw to send any status code
// ============================================================
class HttpError extends Error {
    status;
    payload;
    constructor(status, payload) {
        super(typeof payload === "string" ? payload : `HttpError ${status}`);
        this.status = status;
        this.payload = payload;
    }
}
class ValidationError extends HttpError {
    issues;
    /** Default 422; pass another code to honour the "any status" invariant. */
    constructor(issues, status = 422) {
        super(status, { error: "Validation failed", issues });
        this.issues = issues;
    }
}
Symbol.toSerialize ??= Symbol("Symbol.toSerialize");
// Polyfill the disposal symbols when the runtime lacks them (Node < 20).
Symbol.dispose ??= Symbol.for("nodejs.dispose");
Symbol.asyncDispose ??= Symbol.for("nodejs.asyncDispose");
/** Describe a schema in the given format (default JSON Schema, for OpenAPI). */
function toJsonSchema(schema, kind = "json") {
    const serializer = schema[Symbol.toSerialize];
    return (serializer ? serializer.call(schema, undefined, kind) : {});
}
function isSchema(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value._check === "function");
}
/** Run a schema against a value; throws ValidationError if anything failed. */
function validate(schema, value, status) {
    const issues = [];
    const result = schema._check(value, "", issues);
    if (issues.length)
        throw new ValidationError(issues, status);
    return result;
}
/** Map our metadata onto JSON Schema keywords. */
function jsonMeta(m) {
    const out = {};
    if (m.title !== undefined)
        out.title = m.title;
    if (m.description !== undefined)
        out.description = m.description;
    if (m.examples !== undefined)
        out.examples = m.examples;
    else if (m.example !== undefined)
        out.examples = [m.example];
    return out;
}
/**
 * Wraps a raw schema definition with a chainable `.meta()` (zod-style).
 * `.meta()` returns a NEW schema whose JSON description carries the metadata,
 * leaving the original untouched.
 */
function defineSchema(base) {
    return {
        _check: base._check,
        optional: base.optional,
        _meta: base._meta,
        [Symbol.toSerialize]: base[Symbol.toSerialize],
        meta(metadata) {
            const merged = { ...(base._meta ?? {}), ...metadata };
            return defineSchema({
                _check: base._check,
                optional: base.optional,
                _meta: merged,
                [Symbol.toSerialize]: (value, kind) => {
                    const out = base[Symbol.toSerialize]?.(value, kind);
                    return kind === "json" && out && typeof out === "object"
                        ? { ...out, ...jsonMeta(merged) }
                        : out;
                },
            });
        },
    };
}
const t = {
    string() {
        return defineSchema({
            _check(v, p, i) {
                if (typeof v !== "string") {
                    i.push({ path: p || ".", message: "expected string" });
                }
                return v;
            },
            [Symbol.toSerialize]: (_v, kind) => kind === "json" ? { type: "string" } : {},
        });
    },
    number() {
        return defineSchema({
            _check(v, p, i) {
                // coerce numeric strings (query/params arrive as text)
                if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
                    return Number(v);
                }
                if (typeof v !== "number" || Number.isNaN(v)) {
                    i.push({ path: p || ".", message: "expected number" });
                }
                return v;
            },
            [Symbol.toSerialize]: (_v, kind) => kind === "json" ? { type: "number" } : {},
        });
    },
    boolean() {
        return defineSchema({
            _check(v, p, i) {
                if (v === "true")
                    return true;
                if (v === "false")
                    return false;
                if (typeof v !== "boolean") {
                    i.push({ path: p || ".", message: "expected boolean" });
                }
                return v;
            },
            [Symbol.toSerialize]: (_v, kind) => kind === "json" ? { type: "boolean" } : {},
        });
    },
    literal(lit) {
        return defineSchema({
            _check(v, p, i) {
                if (v !== lit) {
                    i.push({ path: p || ".", message: `expected ${JSON.stringify(lit)}` });
                }
                return v;
            },
            [Symbol.toSerialize]: (_v, kind) => (kind === "json" ? { const: lit } : {}),
        });
    },
    optional(inner) {
        return defineSchema({
            optional: true,
            _check(v, p, i) {
                if (v === undefined)
                    return undefined;
                return inner._check(v, p, i);
            },
            [Symbol.toSerialize]: (_v, kind) => toJsonSchema(inner, kind),
        });
    },
    array(inner) {
        return defineSchema({
            _check(v, p, i) {
                if (!Array.isArray(v)) {
                    i.push({ path: p || ".", message: "expected array" });
                    return [];
                }
                return v.map((item, idx) => inner._check(item, `${p}[${idx}]`, i));
            },
            [Symbol.toSerialize]: (_v, kind) => kind === "json"
                ? { type: "array", items: toJsonSchema(inner, kind) }
                : {},
        });
    },
    union(...options) {
        return defineSchema({
            _check(v, p, i) {
                for (const option of options) {
                    const sub = [];
                    const r = option._check(v, p, sub);
                    if (sub.length === 0)
                        return r;
                }
                i.push({ path: p || ".", message: "no matching variant" });
                return v;
            },
            [Symbol.toSerialize]: (_v, kind) => kind === "json"
                ? { anyOf: options.map((o) => toJsonSchema(o, kind)) }
                : {},
        });
    },
    object(props) {
        return defineSchema({
            _check(v, p, i) {
                if (typeof v !== "object" || v === null || Array.isArray(v)) {
                    i.push({ path: p || ".", message: "expected object" });
                    return {};
                }
                const out = {};
                for (const key of Object.keys(props)) {
                    const schema = props[key];
                    const value = v[key];
                    if (value === undefined && schema.optional)
                        continue;
                    out[key] = schema._check(value, p ? `${p}.${key}` : key, i);
                }
                return out;
            },
            [Symbol.toSerialize]: (_v, kind) => {
                if (kind !== "json")
                    return {};
                const properties = {};
                const required = [];
                for (const key of Object.keys(props)) {
                    properties[key] = toJsonSchema(props[key], kind);
                    if (!props[key].optional)
                        required.push(key);
                }
                return required.length
                    ? { type: "object", properties, required }
                    : { type: "object", properties };
            },
        });
    },
    any() {
        return defineSchema({ _check: (v) => v, [Symbol.toSerialize]: () => ({}) });
    },
};
// Thrown by `ctx.meta.done()` during the documentation pass to unwind the
// annotator (its real I/O must not run); caught + ignored by `#collectMeta`.
const DESCRIBE_DONE = Symbol("describe.done");
// Build the per-context meta object: a plain bag plus a non-enumerable `done()`
// (non-enumerable so it never leaks into JSON output / the OpenAPI `x-guards`).
function makeMeta(ctx) {
    const meta = {};
    Object.defineProperty(meta, "done", {
        value() {
            if (ctx.describing)
                throw DESCRIBE_DONE;
        },
        enumerable: false,
    });
    return meta;
}
// Async context tracking: the current request's Context is available anywhere
// in the async call tree (logging, db, tracing) without threading it through.
const requestContext = new AsyncLocalStorage();
/** Ambient access to the in-flight request context (survives `await`). */
function context() {
    return requestContext.getStore();
}
/** Request-scoped log line — picks up the requestId from async context. */
function trace(message) {
    console.log(`[${context()?.requestId ?? "-"}] ${message}`);
}
function parseCookies(header) {
    const out = {};
    if (!header)
        return out;
    for (const pair of header.split(";")) {
        const eq = pair.indexOf("=");
        if (eq === -1)
            continue;
        const key = pair.slice(0, eq).trim();
        if (key)
            out[key] = decodeURIComponent(pair.slice(eq + 1).trim());
    }
    return out;
}
function serializeCookie(name, value, opts = {}) {
    let s = `${name}=${encodeURIComponent(value)}`;
    if (opts.maxAge !== undefined)
        s += `; Max-Age=${Math.floor(opts.maxAge)}`;
    if (opts.expires)
        s += `; Expires=${opts.expires.toUTCString()}`;
    if (opts.domain)
        s += `; Domain=${opts.domain}`;
    s += `; Path=${opts.path ?? "/"}`;
    if (opts.secure)
        s += "; Secure";
    if (opts.httpOnly)
        s += "; HttpOnly";
    if (opts.sameSite)
        s += `; SameSite=${opts.sameSite}`;
    return s;
}
function appendSetCookie(res, cookie) {
    const prev = res.getHeader("Set-Cookie");
    if (prev === undefined)
        res.setHeader("Set-Cookie", cookie);
    else
        res.setHeader("Set-Cookie", Array.isArray(prev) ? [...prev, cookie] : [String(prev), cookie]);
}
/** Lazy cookie jar: parses `Cookie` on first read, writes `Set-Cookie` on set. */
class CookieJar {
    #req;
    #res;
    #parsed;
    constructor(req, res) {
        this.#req = req;
        this.#res = res;
    }
    get(name) {
        return (this.#parsed ??= parseCookies(this.#req.headers.cookie))[name];
    }
    all() {
        return { ...(this.#parsed ??= parseCookies(this.#req.headers.cookie)) };
    }
    set(name, value, opts) {
        appendSetCookie(this.#res, serializeCookie(name, value, opts));
    }
    /** Expire a cookie now (same path/domain it was set with). */
    delete(name, opts) {
        appendSetCookie(this.#res, serializeCookie(name, "", { ...opts, maxAge: 0, expires: new Date(0) }));
    }
}
/** Build and run the onion chain: mws[0] is outermost, `inner` is the core. */
function runMiddleware(mws, ctx, inner) {
    let chain = inner;
    for (let i = mws.length - 1; i >= 0; i--) {
        const mw = mws[i];
        const downstream = chain;
        chain = () => Promise.resolve(mw(ctx, downstream));
    }
    return chain();
}
// The concrete per-request context. A class (not a literal) so `cookies` can be
// a lazy getter — the hot path pays nothing until a cookie is actually touched.
class HttpContext {
    request;
    response;
    params;
    query;
    body;
    requestId;
    state = {};
    describing;
    #meta;
    #cookies;
    // Lazy (like `cookies`): the hot path pays nothing until `meta` is touched —
    // only guards/interceptors that self-describe (or the doc harvest) build it.
    get meta() {
        return (this.#meta ??= makeMeta(this));
    }
    // Reassigning `ctx.meta = {…}` merges the new fields onto the persistent meta
    // object, preserving its (non-enumerable) `done()`.
    set meta(value) {
        const m = (this.#meta ??= makeMeta(this));
        for (const k of Object.keys(m))
            delete m[k];
        Object.assign(m, value);
    }
    /** Internal: compiled serializer chosen by #resolve, read by #dispatch's send. */
    _serializer;
    constructor(request, response, params, query, body, requestId) {
        this.request = request;
        this.response = response;
        this.params = params;
        this.query = query;
        this.body = body;
        this.requestId = requestId;
    }
    get cookies() {
        return (this.#cookies ??= new CookieJar(this.request, this.response));
    }
}
// A throwaway, socket-less context for OFF-REQUEST execution — harvesting OpenAPI
// `meta` (`describing: true`) or trying a route's guards against synthetic input
// (`tryGuards`). Not a live request: the response is a no-op header sink.
function stubContext(method, path, init = {}) {
    const request = {
        method,
        url: path,
        headers: init.headers ?? {},
        socket: { remoteAddress: "127.0.0.1" },
    };
    const response = {
        setHeader() { },
        getHeader() {
            return undefined;
        },
        hasHeader() {
            return false;
        },
        removeHeader() { },
        getHeaderNames() {
            return [];
        },
        headersSent: false,
        writableEnded: false,
    };
    const ctx = new HttpContext(request, response, init.params ?? EMPTY_BAG, init.query ?? EMPTY_BAG, init.body, "stub");
    if (init.describing)
        ctx.describing = true;
    return ctx;
}
function describeContext(method, path) {
    return stubContext(method, path, { describing: true });
}
/** A guard's documentation name: its `doc.name` (set by {@link withDocumentation}),
 *  else its function name, else `"guard"`. */
function guardDocName(g) {
    const d = g.doc;
    return (typeof d === "object" ? d?.name : d) || g.name || "guard";
}
function hasOwnKeys(o) {
    for (const _ in o)
        return true;
    return false;
}
// A cached body that owns a stream can't be replayed — skip those.
function isCacheable(result) {
    if (isResult(result)) {
        if (result[OWNS_STREAM])
            return false; // File(): re-openable stream, don't read body
        const body = result.body;
        return !(body instanceof Readable);
    }
    return !(result instanceof Readable);
}
// A headless ServerResponse stand-in: `send` writes into it, we keep the bytes.
// Lets us serialize a result to a buffer with the real send() path, no socket.
class BufferingResponse {
    statusCode = 200;
    writableEnded = false;
    headersSent = false;
    #headers = {};
    #chunks = [];
    #buf(c, enc) {
        return Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === "string" ? enc : "utf8");
    }
    setHeader(k, v) { this.#headers[k.toLowerCase()] = v; }
    getHeader(k) { return this.#headers[k.toLowerCase()]; }
    hasHeader(k) { return k.toLowerCase() in this.#headers; }
    removeHeader(k) { delete this.#headers[k.toLowerCase()]; }
    getHeaders() { return { ...this.#headers }; }
    writeHead(status, headers) {
        this.statusCode = status;
        if (headers)
            for (const k in headers)
                this.setHeader(k, headers[k]);
        this.headersSent = true;
        return this;
    }
    write(c, enc) { if (c)
        this.#chunks.push(this.#buf(c, enc)); return true; }
    end(c, enc) {
        if (c && typeof c !== "function")
            this.#chunks.push(this.#buf(c, enc));
        this.writableEnded = true;
        this.headersSent = true;
    }
    compiled() {
        return {
            status: this.statusCode,
            headers: this.getHeaders(),
            body: this.#chunks.length === 1 ? this.#chunks[0] : Buffer.concat(this.#chunks),
        };
    }
}
/** Serialize a result to bytes through the real send() path (no live socket). */
async function compileResult(result, kind, serializer) {
    const fake = new BufferingResponse();
    const pending = send(fake, result, kind, serializer);
    if (pending)
        await pending;
    return fake.compiled();
}
/** Write a precompiled response to a live socket (no serialization). */
function replayCompiled(res, c, tag) {
    res.statusCode = c.status;
    const h = c.headers;
    for (const k in h) {
        const v = h[k];
        if (v !== undefined)
            res.setHeader(k, v);
    }
    res.setHeader("x-cache", tag);
    res.end(c.body);
}
/** In-memory response cache: TTL, LRU-ish cap, coalescing, stale-while-revalidate,
 * optional response compilation, and flexible invalidation. */
function createCache(opts = {}) {
    const ttl = opts.ttl ?? 30_000;
    const max = opts.max ?? 1000;
    const swr = opts.staleWhileRevalidate ?? 0;
    const compile = opts.compile === true;
    const coalesce = opts.coalesce !== false;
    const keyOf = opts.key ?? ((ctx) => `${ctx.request.method} ${ctx.request.url}`);
    const store = new Map();
    const flights = new Map(); // single-flight
    const revalidating = new Set(); // background SWR refreshes in progress
    const touch = (key, entry) => {
        store.delete(key); // re-insert → most-recently-used (Map keeps insertion order)
        store.set(key, entry);
    };
    const setEntry = (key, entry) => {
        store.set(key, entry);
        if (store.size > max)
            store.delete(store.keys().next().value);
    };
    // Serve a cached entry: replay bytes when compiled, else hand back the value.
    const serve = (ctx, entry, tag) => {
        if (compile && entry.compiled) {
            replayCompiled(ctx.response, entry.compiled, tag);
            return undefined; // already written → outer send is skipped
        }
        ctx.response.setHeader("x-cache", tag);
        return entry.result;
    };
    // Persist a freshly computed result (+ compiled bytes when enabled).
    const persist = async (key, ctx, result) => {
        const expires = Date.now() + ttl;
        const entry = { result, expires, staleUntil: expires + swr };
        if (compile) {
            const kind = negotiate(ctx.request.headers.accept);
            entry.compiled = await compileResult(result, kind, ctx._serializer);
        }
        setEntry(key, entry);
        return entry;
    };
    // Refresh a stale entry once, in the background, off the request's critical path.
    const scheduleRevalidate = (key, ctx, next) => {
        if (revalidating.has(key))
            return;
        revalidating.add(key);
        // setTimeout (not microtask) so the current request fully completes — and
        // outer middleware stop reading ctx.response — before we borrow it.
        setTimeout(async () => {
            const realRes = ctx.response;
            ctx.response = new BufferingResponse();
            try {
                const result = await next();
                if (isCacheable(result))
                    await persist(key, ctx, result);
            }
            catch {
                // keep serving the existing (stale) entry on failure
            }
            finally {
                ctx.response = realRes;
                revalidating.delete(key);
            }
        }, 0);
    };
    return {
        middleware() {
            return async (ctx, next) => {
                const req = ctx.request;
                const res = ctx.response;
                // Cache the safe, idempotent methods: GET, plus QUERY (RFC 9110-style).
                // A QUERY's response depends on its request body, so the key folds in a
                // hash of the body — and `collectRaw` memoizes it, so the handler's
                // later `readBody` reuses the same bytes (no double-drain of the stream).
                if (req.method !== "GET" && req.method !== "QUERY")
                    return next();
                let key = keyOf(ctx);
                if (req.method === "QUERY") {
                    const raw = await collectRaw(req);
                    key += " " + createHash("sha1").update(raw).digest("base64url");
                }
                const now = Date.now();
                const entry = store.get(key);
                if (entry) {
                    if (entry.expires > now) {
                        touch(key, entry);
                        return serve(ctx, entry, "HIT");
                    }
                    if (now < entry.staleUntil) {
                        touch(key, entry);
                        scheduleRevalidate(key, ctx, next); // refresh behind the scenes
                        return serve(ctx, entry, "STALE");
                    }
                    store.delete(key); // past the stale window
                }
                // Coalesce concurrent misses onto one computation.
                if (coalesce) {
                    const pending = flights.get(key);
                    if (pending) {
                        res.setHeader("x-cache", "COALESCED");
                        return pending;
                    }
                }
                const flight = next();
                if (coalesce)
                    flights.set(key, flight);
                let result;
                try {
                    result = await flight;
                }
                finally {
                    if (coalesce)
                        flights.delete(key);
                }
                // Handler streamed/wrote the response itself, or it's uncacheable.
                if (res.headersSent || res.writableEnded || !isCacheable(result)) {
                    if (!res.headersSent)
                        res.setHeader("x-cache", "MISS");
                    return result;
                }
                const stored = await persist(key, ctx, result);
                if (compile && stored.compiled) {
                    replayCompiled(res, stored.compiled, "MISS"); // serialize once → write
                    return undefined;
                }
                res.setHeader("x-cache", "MISS");
                return result;
            };
        },
        invalidate(target) {
            if (typeof target === "string")
                return store.delete(target) ? 1 : 0;
            const match = target instanceof RegExp ? (k) => target.test(k) : target;
            let n = 0;
            for (const k of [...store.keys()])
                if (match(k))
                    n += store.delete(k) ? 1 : 0;
            return n;
        },
        clear() {
            store.clear();
        },
        get size() {
            return store.size;
        },
        get inflight() {
            return flights.size;
        },
    };
}
/** Shared response cache backed by a distributed `CacheStore` (see `@youneed/kv`).
 *  Freshness + the stale window are carried in the stored payload; LRU/eviction is
 *  delegated to the backend (e.g. Redis `maxmemory`) plus the per-key TTL.
 *  Coalescing and background revalidation are per-node. */
function createDistributedCache(opts) {
    const store = opts.store;
    const ttl = opts.ttl ?? 30_000;
    const swr = opts.staleWhileRevalidate ?? 0;
    const coalesce = opts.coalesce !== false;
    const prefix = opts.prefix ?? "cache:";
    const keyOf = opts.key ?? ((ctx) => `${ctx.request.method} ${ctx.request.url}`);
    const flights = new Map(); // per-node single-flight
    const revalidating = new Set(); // per-node background SWR refreshes
    // The store's own TTL (seconds) must outlast the whole fresh + stale window.
    const storeTtlSec = Math.max(1, Math.ceil((ttl + swr) / 1000));
    const decode = (raw) => {
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined; // corrupt payload → treat as a miss
        }
    };
    const replay = (ctx, e, tag) => {
        replayCompiled(ctx.response, { status: e.s, headers: e.h, body: Buffer.from(e.b, "base64") }, tag);
        return undefined; // already written → outer send is skipped
    };
    const persist = async (key, ctx, result) => {
        if (!isCacheable(result))
            return undefined;
        const kind = negotiate(ctx.request.headers.accept);
        const compiled = await compileResult(result, kind, ctx._serializer);
        const entry = { s: compiled.status, h: compiled.headers, b: compiled.body.toString("base64"), e: Date.now() + ttl };
        await store.set(prefix + key, JSON.stringify(entry), { ttl: storeTtlSec });
        return entry;
    };
    const scheduleRevalidate = (key, ctx, next) => {
        if (revalidating.has(key))
            return;
        revalidating.add(key);
        // setTimeout (not microtask) so the current request fully completes — and outer
        // middleware stop reading ctx.response — before we borrow it for the refresh.
        setTimeout(async () => {
            const realRes = ctx.response;
            ctx.response = new BufferingResponse();
            try {
                await persist(key, ctx, await next());
            }
            catch {
                // keep serving the existing (stale) entry on failure
            }
            finally {
                ctx.response = realRes;
                revalidating.delete(key);
            }
        }, 0);
    };
    return {
        middleware() {
            return async (ctx, next) => {
                const req = ctx.request;
                const res = ctx.response;
                if (req.method !== "GET" && req.method !== "QUERY")
                    return next();
                let key = keyOf(ctx);
                if (req.method === "QUERY") {
                    const raw = await collectRaw(req);
                    key += " " + createHash("sha1").update(raw).digest("base64url");
                }
                const now = Date.now();
                const raw = await store.get(prefix + key);
                const entry = raw ? decode(raw) : undefined;
                if (entry) {
                    if (entry.e > now)
                        return replay(ctx, entry, "HIT");
                    if (now < entry.e + swr) {
                        scheduleRevalidate(key, ctx, next); // refresh behind the scenes
                        return replay(ctx, entry, "STALE");
                    }
                    // past the stale window → fall through and recompute (store will expire it)
                }
                // Coalesce concurrent misses onto one computation (this node only).
                if (coalesce) {
                    const pending = flights.get(key);
                    if (pending) {
                        res.setHeader("x-cache", "COALESCED");
                        return pending;
                    }
                }
                const flight = next();
                if (coalesce)
                    flights.set(key, flight);
                let result;
                try {
                    result = await flight;
                }
                finally {
                    if (coalesce)
                        flights.delete(key);
                }
                // Handler streamed/wrote the response itself, or it's uncacheable.
                if (res.headersSent || res.writableEnded || !isCacheable(result)) {
                    if (!res.headersSent)
                        res.setHeader("x-cache", "MISS");
                    return result;
                }
                const stored = await persist(key, ctx, result);
                if (stored) {
                    replayCompiled(res, { status: stored.s, headers: stored.h, body: Buffer.from(stored.b, "base64") }, "MISS");
                    return undefined;
                }
                res.setHeader("x-cache", "MISS");
                return result;
            };
        },
        async invalidate(target) {
            if (typeof target === "string") {
                await store.delete(prefix + target);
                return 1;
            }
            if (!store.scan)
                throw new Error("invalidate(RegExp|predicate) requires a store with scan()");
            const match = target instanceof RegExp ? (k) => target.test(k) : target;
            let n = 0;
            for (const full of await store.scan(prefix)) {
                if (match(full.slice(prefix.length))) {
                    await store.delete(full);
                    n++;
                }
            }
            return n;
        },
        async clear() {
            if (!store.scan)
                throw new Error("clear() requires a store with scan()");
            for (const full of await store.scan(prefix))
                await store.delete(full);
        },
        async size() {
            if (!store.scan)
                throw new Error("size() requires a store with scan()");
            return (await store.scan(prefix)).length;
        },
        get inflight() {
            return flights.size;
        },
    };
}
// Append a token to the `Vary` header without duplicating it. Exported as `vary`
// for the cors/compression middleware packages.
function appendVary(res, value) {
    const prev = res.getHeader("Vary");
    if (!prev)
        return value;
    const list = String(prev);
    return list.split(",").map((s) => s.trim().toLowerCase()).includes(value.toLowerCase())
        ? list
        : `${list}, ${value}`;
}
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
function withDocumentation(fn, doc) {
    if (!doc)
        return fn;
    const wrapped = (ctx, ...rest) => {
        ctx.meta = { ...doc };
        ctx.meta.done(); // documenting → halts here; real request → no-op, continue
        return fn(ctx, ...rest);
    };
    // Also stamp the doc statically, so STATIC introspection (`app.topology()` →
    // `@youneed/server-plugin-devtools`) can read it without the harvest pass.
    wrapped.doc = doc;
    return wrapped;
}
/** {@link withDocumentation} typed for a {@link Guard}. */
function guardWithDocumentation(guard, doc) {
    return withDocumentation(guard, doc);
}
function responseSchemaFor(response, status) {
    if (!response)
        return undefined;
    if (isSchema(response))
        return status === 200 ? response : undefined;
    return response[status];
}
const routeRegistry = createRegistry(() => new Map());
function registerRoute(ctor, meta) {
    routeRegistry.for(ctor).set(`${meta.protocol}:${meta.trigger}:${meta.handlerName}`, meta);
}
function getRoutes(ctor) {
    return [...(routeRegistry.read(ctor)?.values() ?? [])];
}
// Method-level guards live in a parallel registry, keyed by handler name, and
// are merged with the controller's class-level guards at mount time.
const guardRegistry = createRegistry(() => new Map());
function registerGuards(ctor, handlerName, guards) {
    const map = guardRegistry.for(ctor);
    map.set(handlerName, [...(map.get(handlerName) ?? []), ...guards]);
}
function getGuards(ctor, handlerName) {
    return guardRegistry.read(ctor)?.get(handlerName) ?? [];
}
// Method-level interceptors, same shape as the guard registry.
const interceptorRegistry = createRegistry(() => new Map());
function registerInterceptors(ctor, handlerName, interceptors) {
    const map = interceptorRegistry.for(ctor);
    map.set(handlerName, [...(map.get(handlerName) ?? []), ...interceptors]);
}
function getInterceptors(ctor, handlerName) {
    return interceptorRegistry.read(ctor)?.get(handlerName) ?? [];
}
// Method-level middleware, same shape as the guard registry. Controller
// middleware runs OUTSIDE guards (Express-style), unlike interceptors.
const ctrlMiddlewareRegistry = createRegistry(() => new Map());
function registerMiddlewares(ctor, handlerName, mws) {
    const map = ctrlMiddlewareRegistry.for(ctor);
    map.set(handlerName, [...(map.get(handlerName) ?? []), ...mws]);
}
function getMiddlewares(ctor, handlerName) {
    return ctrlMiddlewareRegistry.read(ctor)?.get(handlerName) ?? [];
}
// ============================================================
// Method decorators
// ============================================================
function httpMethod(trigger) {
    // Usage: @Controller.post("/path", { body, response }) or @Controller.post({ body })
    return function (pathOrSchema, maybeSchema) {
        const path = typeof pathOrSchema === "string" ? pathOrSchema : "";
        const schema = typeof pathOrSchema === "string" ? maybeSchema : pathOrSchema;
        return function (_target, ctx) {
            ctx.addInitializer(function () {
                registerRoute(ctorOf(this), {
                    protocol: "http",
                    trigger,
                    path,
                    handlerName: ctx.name,
                    schema,
                });
            });
        };
    };
}
// @Controller.guard(auth, isAdmin) — attaches guards to a single handler.
// Stacks with the controller's class-level guards (those run first).
function guard(...guards) {
    return function (_target, ctx) {
        ctx.addInitializer(function () {
            registerGuards(ctorOf(this), ctx.name, guards);
        });
    };
}
// @Controller.intercept(timing, envelope) — wraps a single handler. Stacks with
// the controller's class-level interceptors (those run outermost).
function intercept(...interceptors) {
    return function (_target, ctx) {
        ctx.addInitializer(function () {
            registerInterceptors(ctorOf(this), ctx.name, interceptors);
        });
    };
}
// @Controller.middleware(logger, cors) — attaches middleware to a single handler.
// Runs OUTSIDE the controller's guards/interceptors (Express-style), stacking
// after the controller's class-level middleware.
function middleware(...mws) {
    return function (_target, ctx) {
        ctx.addInitializer(function () {
            registerMiddlewares(ctorOf(this), ctx.name, mws);
        });
    };
}
const decorators = {
    get: httpMethod("GET"),
    post: httpMethod("POST"),
    put: httpMethod("PUT"),
    patch: httpMethod("PATCH"),
    delete: httpMethod("DELETE"),
    // QUERY (RFC 9110-style safe method with a body): like GET but the query is
    // carried in the request content instead of the URL, so it's safe + idempotent
    // and its responses are cacheable (keyed on the body). See `createCache`.
    query: httpMethod("QUERY"),
    guard,
    intercept,
    middleware,
    // future: message(event) -> { protocol: "ws", ... }
    //         command(name)  -> { protocol: "cli", ... }
};
// Fallback when no logger middleware ran — so `this.log` never throws.
const CONSOLE_LOGGER = {
    error: (m, meta) => console.error(m, meta ?? ""),
    warn: (m, meta) => console.warn(m, meta ?? ""),
    info: (m, meta) => console.info(m, meta ?? ""),
    debug: (m, meta) => console.debug(m, meta ?? ""),
};
class ControllerInternal {
    /** Base path shared by every route of the controller. */
    static basePath = "";
    /** Guards applied to every route of the controller (run before per-method ones). */
    static guards = [];
    /** Interceptors wrapping every route of the controller (outermost; before the
     *  per-method ones, which wrap the handler more closely). */
    static interceptors = [];
    /** Middleware applied to every route of the controller. Runs OUTSIDE guards
     *  (Express-style), before the per-method `@Controller.middleware` ones. */
    static middlewares = [];
    /** Providers installed once on the controller instance at mount — they add
     *  PRIVATE members under a namespace (e.g. `this.orm`). Unlike guards/middleware
     *  (which only gate/transform a request), a provider extends the instance. */
    static providers = [];
    /**
     * Descriptor factory, callable + `.json` / `.text` shortcuts:
     *   this.Response({ status, headers, body })
     *   this.Response.json(value, { status })
     *   this.Response.text(str, { status })
     */
    Response = Response;
    /** The in-flight request context (via async-local storage); `undefined` outside
     *  a request. Lets a controller method read `this.ctx` instead of taking `ctx`. */
    get ctx() {
        return context();
    }
    /** The request-scoped logger set by `@youneed/server-middleware-logger`
     *  (`ctx.state.logger`), so a controller method can `this.log.info(...)` and the
     *  line carries requestId/traceId. Falls back to `console` when not installed. */
    get log() {
        const state = context()?.state;
        const key = state?.__loggerKey ?? "logger";
        return state?.[key] ?? CONSOLE_LOGGER;
    }
    static decorators = decorators;
}
function Controller(basePathOrConfig = "", opts) {
    const cfg = typeof basePathOrConfig === "string" ? { url: basePathOrConfig, ...opts } : basePathOrConfig;
    class ScopedController extends ControllerInternal {
        static basePath = cfg.url ?? cfg.basePath ?? "";
        static guards = cfg.guards ?? [];
        static interceptors = cfg.interceptors ?? [];
        static middlewares = cfg.middlewares ?? [];
        static providers = (cfg.providers ?? []);
    }
    // `typeof ScopedController` is preserved verbatim (statics + `() => ScopedController`).
    // The extra abstract construct signature folds each provider's contribution into
    // the INSTANCE type, so `extends Controller(path, { providers })` gives a typed
    // `this.<member>` (e.g. `this.orm`). No providers ⇒ contribution `{}` (a no-op).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ScopedController;
}
// Decorator shortcuts: `@Controller.get()` == `@Controller.decorators.get()`.
Controller.decorators = decorators;
Controller.get = decorators.get;
Controller.post = decorators.post;
Controller.put = decorators.put;
Controller.patch = decorators.patch;
Controller.delete = decorators.delete;
Controller.query = decorators.query;
Controller.guard = decorators.guard;
Controller.intercept = decorators.intercept;
Controller.middleware = decorators.middleware;
// ============================================================
// WebSocket support
// ============================================================
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
/** Minimal RFC 6455 connection — text/binary frames, ping/pong, close. */
class WsConnection extends EventEmitter {
    #socket;
    #buf = Buffer.alloc(0);
    readyState = 1; // OPEN
    constructor(socket) {
        super();
        this.#socket = socket;
        socket.on("data", (chunk) => this.#onData(chunk));
        socket.on("close", () => {
            this.readyState = 3;
            this.emit("close");
        });
        socket.on("error", () => {
            this.readyState = 3;
        });
    }
    #onData(chunk) {
        this.#buf = Buffer.concat([this.#buf, chunk]);
        let frame;
        while ((frame = this.#parse())) {
            const { opcode, payload } = frame;
            if (opcode === 0x8)
                return this.close(); // close
            if (opcode === 0x9)
                this.#frame(0xa, payload); // ping -> pong
            else if (opcode === 0x1)
                this.emit("message", payload.toString("utf8"));
            else if (opcode === 0x2)
                this.emit("message", payload);
        }
    }
    #parse() {
        const buf = this.#buf;
        if (buf.length < 2)
            return null;
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let offset = 2;
        if (len === 126) {
            if (buf.length < 4)
                return null;
            len = buf.readUInt16BE(2);
            offset = 4;
        }
        else if (len === 127) {
            if (buf.length < 10)
                return null;
            len = Number(buf.readBigUInt64BE(2));
            offset = 10;
        }
        let maskKey = null;
        if (masked) {
            if (buf.length < offset + 4)
                return null;
            maskKey = buf.subarray(offset, offset + 4);
            offset += 4;
        }
        if (buf.length < offset + len)
            return null;
        let payload = buf.subarray(offset, offset + len);
        if (maskKey) {
            payload = Buffer.from(payload);
            for (let i = 0; i < payload.length; i++)
                payload[i] ^= maskKey[i % 4];
        }
        this.#buf = buf.subarray(offset + len);
        return { opcode, payload };
    }
    #frame(opcode, payload) {
        const len = payload.length;
        let header;
        if (len < 126) {
            header = Buffer.from([0x80 | opcode, len]);
        }
        else if (len < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x80 | opcode;
            header[1] = 126;
            header.writeUInt16BE(len, 2);
        }
        else {
            header = Buffer.alloc(10);
            header[0] = 0x80 | opcode;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(len), 2);
        }
        this.#socket.write(Buffer.concat([header, payload]));
    }
    send(data) {
        if (this.readyState !== 1)
            return;
        const isText = typeof data === "string";
        this.#frame(isText ? 0x1 : 0x2, isText ? Buffer.from(data, "utf8") : data);
    }
    close(code = 1000) {
        if (this.readyState === 3)
            return;
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(code, 0);
        this.#frame(0x8, payload);
        this.readyState = 3;
        this.#socket.end();
    }
}
class SseConnection {
    #res;
    #closed = false;
    constructor(res) {
        this.#res = res;
        res.on("close", () => (this.#closed = true));
    }
    get closed() {
        return this.#closed;
    }
    send(event) {
        if (this.#closed)
            return;
        const e = typeof event === "string" ? { data: event } : event;
        let frame = "";
        if (e.event)
            frame += `event: ${e.event}\n`;
        if (e.id)
            frame += `id: ${e.id}\n`;
        if (e.retry)
            frame += `retry: ${e.retry}\n`;
        const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
        for (const line of data.split("\n"))
            frame += `data: ${line}\n`;
        this.#res.write(frame + "\n");
    }
    close() {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#res.end();
    }
}
async function startSse(req, res, handlers) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    const conn = new SseConnection(res);
    req.on("close", () => handlers.close?.(conn));
    const out = handlers.open?.(conn);
    if (isStreamable(out)) {
        for await (const event of out) {
            if (conn.closed)
                break;
            if (event == null)
                continue; // tolerate stray `yield` (e.g. a bare await)
            conn.send(event);
        }
        conn.close();
    }
    else {
        await out;
    }
}
/**
 * Release a set of resources in reverse (LIFO) order — last mounted, first torn
 * down. An async disposer is awaited; a sync one runs as-is. Objects without
 * either method are skipped, so implementing disposal is always optional.
 */
async function disposeAll(items) {
    for (let i = items.length - 1; i >= 0; i--) {
        const d = items[i];
        if (typeof d[Symbol.asyncDispose] === "function")
            await d[Symbol.asyncDispose]();
        else if (typeof d[Symbol.dispose] === "function")
            d[Symbol.dispose]();
    }
}
/** Construct the server for the requested protocol. */
function createListenServer(opts, handler) {
    if (opts.http3) {
        throw new Error("HTTP/3 has no stable server API in this runtime (no node:quic / node:http3). " +
            "Terminate HTTP/3 at a proxy (Caddy, nginx-quic, Cloudflare) and forward to " +
            "this server over HTTP/2 — use { http2: true, key, cert } here.");
    }
    if (opts.http2) {
        if (opts.http2 === "h2c") {
            // Cleartext h2 — compat API still gives us (req, res).
            return createHttp2Cleartext(handler);
        }
        if (!opts.key || !opts.cert) {
            throw new Error("http2: true needs TLS `key` and `cert` (or use http2: 'h2c' for cleartext).");
        }
        return createHttp2Secure({ key: opts.key, cert: opts.cert, allowHTTP1: opts.allowHTTP1 !== false }, handler);
    }
    return new Server(handler);
}
/** WebSocket upgrade rides the HTTP/1.1 connection — available unless we're on
 *  pure (no-fallback) h2, where there's no `upgrade` event. */
function supportsWsUpgrade(opts) {
    if (opts.http2 === "h2c")
        return false; // pure cleartext h2, no http/1.1
    if (opts.http2 === true && opts.allowHTTP1 === false)
        return false;
    return true;
}
class HTTP {
    server;
    #port;
    // Disposing the server also disposes the controllers it was built from.
    #onDispose;
    constructor(server, onDispose) {
        this.server = server;
        this.#onDispose = onDispose;
    }
    listen(port, cb, host) {
        this.#port = port;
        if (host)
            this.server.listen(port, host, () => cb(this));
        else
            this.server.listen(port, () => cb(this));
    }
    get port() {
        return this.#port;
    }
    /** Stop accepting connections and resolve once the server has closed. */
    close() {
        // Nothing to close if it was built but never `listen`ed — avoid the
        // ERR_SERVER_NOT_RUNNING that server.close() would otherwise throw.
        if (!this.server.listening)
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            this.server.close((err) => (err ? reject(err) : resolve()));
            // Drop idle keep-alive sockets so close() doesn't hang on them. Present on
            // http.Server and (at runtime) http2 servers, but not in the h2 types.
            this.server.closeAllConnections?.();
        });
    }
    /**
     * Gracefully drain the server: run `onShutdown` (e.g. flip a readiness probe to
     * failing so a load balancer stops routing), stop accepting new connections,
     * drop IDLE keep-alive sockets, let in-flight requests finish — but force any
     * stragglers closed after `timeout` ms — then dispose controllers. Unlike
     * {@link close} (which closes everything at once), this waits for in-flight work.
     */
    async drain(opts = {}) {
        const timeoutMs = opts.timeout ?? 10_000;
        const server = this.server;
        try {
            await opts.onShutdown?.();
        }
        catch {
            /* a failing shutdown hook must not block the drain */
        }
        if (server.listening) {
            await new Promise((resolve) => {
                // Sweep keep-alive sockets that go idle as their in-flight request
                // finishes (close() alone waits for them indefinitely); force the rest
                // after the deadline.
                const sweep = setInterval(() => server.closeIdleConnections?.(), 50);
                const forced = setTimeout(() => server.closeAllConnections?.(), timeoutMs);
                sweep.unref?.();
                forced.unref?.();
                server.close(() => {
                    clearInterval(sweep);
                    clearTimeout(forced);
                    resolve();
                });
                server.closeIdleConnections?.();
            });
        }
        await this.#onDispose?.();
    }
    /**
     * Wire {@link drain} to process termination signals (default `SIGTERM`/`SIGINT`),
     * then `process.exit(0)` — zero-downtime shutdown for k8s/PM2/etc. Chainable:
     *   app.listen(3000, (s) => s.gracefulShutdown({ onShutdown: () => health.down() }));
     */
    gracefulShutdown(opts = {}) {
        const signals = opts.signals ?? ["SIGTERM", "SIGINT"];
        let started = false;
        for (const sig of signals) {
            process.once(sig, () => {
                if (started)
                    return;
                started = true;
                void this.drain(opts).then(() => process.exit(0));
            });
        }
        return this;
    }
    /**
     * `await using server = app.listen(...)` (or a SIGINT handler) closes the
     * socket, then disposes every mounted controller in reverse order.
     */
    async [Symbol.asyncDispose]() {
        await this.close();
        await this.#onDispose?.();
    }
}
/** Does a `use(prefix, …)` scope cover this route path? */
function prefixCovers(prefix, path) {
    if (prefix === "/" || prefix === path)
        return true;
    return path.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}
function compileJsonSerializer(node) {
    if (!node || typeof node !== "object" || node.anyOf || node.const !== undefined) {
        return (v) => JSON.stringify(v) ?? "null";
    }
    switch (node.type) {
        case "string":
            return (v) => (v == null ? "null" : JSON.stringify(v));
        case "number":
        case "integer":
            return (v) => (typeof v === "number" && Number.isFinite(v) ? "" + v : "null");
        case "boolean":
            return (v) => (v === true ? "true" : v === false ? "false" : "null");
        case "array": {
            const item = compileJsonSerializer(node.items);
            return (v) => {
                if (!Array.isArray(v))
                    return "null";
                let s = "[";
                for (let i = 0; i < v.length; i++)
                    s += (i ? "," : "") + item(v[i]);
                return s + "]";
            };
        }
        case "object": {
            const props = node.properties ?? {};
            const required = new Set(node.required ?? []);
            const fields = Object.keys(props).map((k) => ({
                key: k,
                prefix: JSON.stringify(k) + ":",
                ser: compileJsonSerializer(props[k]),
                optional: !required.has(k),
            }));
            return (v) => {
                if (v == null || typeof v !== "object")
                    return "null";
                const obj = v;
                let s = "{";
                let first = true;
                for (const f of fields) {
                    const val = obj[f.key];
                    if (val === undefined && f.optional)
                        continue;
                    s += (first ? "" : ",") + f.prefix + (val === undefined ? "null" : f.ser(val));
                    first = false;
                }
                return s + "}";
            };
        }
        default:
            return (v) => JSON.stringify(v) ?? "null";
    }
}
function compileResponseSerializers(response) {
    if (!response)
        return undefined;
    const out = {};
    if (isSchema(response)) {
        out[200] = compileJsonSerializer(toJsonSchema(response));
    }
    else {
        for (const [status, schema] of Object.entries(response)) {
            out[Number(status)] = compileJsonSerializer(toJsonSchema(schema));
        }
    }
    return out;
}
// Shared empty bag for routes with no params/query — avoids allocating two
// throwaway objects on every request to a static, query-less route.
const EMPTY_BAG = {};
// Correlation id: a per-process counter is ~two orders of magnitude cheaper
// than crypto.randomUUID() on the request hot path, while staying unique within
// the process (an inbound x-request-id still wins for cross-service tracing).
const ID_PREFIX = `${process.pid.toString(36)}-`;
let idSeq = 0;
function fastId() {
    return ID_PREFIX + (++idSeq).toString(36);
}
class HttpTransport {
    // Static paths: O(1) two-level lookup (method → path) so the hot path never
    // builds a `"METHOD /path"` key string. Dynamic paths: per-method list.
    #static = new Map();
    #dynamic = new Map();
    #wsRoutes = [];
    // Global middleware wrap routing (see #handle); scoped ones are folded into
    // each matching route's `middleware` list below.
    #globalMw;
    constructor(httpRoutes, wsRoutes, middleware = []) {
        this.#globalMw = middleware.filter((e) => !e.prefix).map((e) => e.mw);
        const scoped = middleware.filter((e) => e.prefix);
        const routeMw = (path) => scoped.filter((e) => prefixCovers(e.prefix, path)).map((e) => e.mw);
        for (const r of httpRoutes) {
            const method = r.method.toUpperCase();
            const needsBody = (method === "POST" ||
                method === "PUT" ||
                method === "PATCH" ||
                method === "QUERY") && // QUERY carries its query in the request body
                r.schema?.body !== false; // `body: false` → raw-stream handler reads it itself
            const serializers = compileResponseSerializers(r.schema?.response);
            // Path-scoped (use("/x", …)) middleware first, then controller-attached
            // middleware — both run OUTSIDE this route's guards/interceptors.
            const mw = [...routeMw(r.path), ...(r.middlewares ?? [])];
            if (r.path.includes(":")) {
                const { matcher, paramNames } = compilePath(r.path);
                let list = this.#dynamic.get(method);
                if (!list)
                    this.#dynamic.set(method, (list = []));
                list.push({ handler: r.handler, schema: r.schema, guards: r.guards, interceptors: r.interceptors, needsBody, matcher, paramNames, serializers, middleware: mw });
            }
            else {
                let byPath = this.#static.get(method);
                if (!byPath)
                    this.#static.set(method, (byPath = new Map()));
                byPath.set(r.path, {
                    handler: r.handler,
                    schema: r.schema,
                    guards: r.guards,
                    interceptors: r.interceptors,
                    needsBody,
                    serializers,
                    middleware: mw,
                });
            }
        }
        for (const w of wsRoutes) {
            const { matcher } = compilePath(w.path);
            this.#wsRoutes.push({ matcher, handlers: w.handlers });
        }
    }
    build(onDispose, opts = {}) {
        const server = createListenServer(opts, (req, res) => this.#dispatch(req, res));
        // WebSocket upgrades ride HTTP/1.1 — skip wiring it on pure h2 (no upgrade event).
        if (this.#wsRoutes.length && supportsWsUpgrade(opts)) {
            server.on("upgrade", (req, socket) => this.#upgrade(req, socket));
        }
        return new HTTP(server, onDispose);
    }
    // Guards then handler — the core wrapped by per-route middleware. Hoisted
    // (class field arrow) so it isn't reallocated per request.
    #runRoute = async (ctx, route) => {
        if (route.guards) {
            for (const g of route.guards) {
                if ((await g(ctx)) === false) {
                    throw new HttpError(403, { error: "Forbidden" });
                }
            }
        }
        // Guards pass → interceptors wrap the handler (before/after + can transform
        // the result). No interceptors → call the handler directly (no extra hop).
        return route.interceptors?.length
            ? runMiddleware(route.interceptors, ctx, () => Promise.resolve(route.handler(ctx)))
            : route.handler(ctx);
    };
    // Resolve the route, validate input, run per-route middleware + handler, then
    // validate output and pick the compiled serializer. Returns the result VALUE
    // (the caller sends it) so result-transforming middleware (cache, compression)
    // can see and reshape it as the chain unwinds.
    #resolve = async (ctx) => {
        const req = ctx.request;
        const res = ctx.response;
        const rawUrl = req.url ?? "/";
        const qi = rawUrl.indexOf("?");
        let pathname = qi === -1 ? rawUrl : rawUrl.slice(0, qi);
        // paths are normalized at registration (no trailing slash) — match that
        if (pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47) {
            pathname = pathname.slice(0, -1);
        }
        const method = req.method ?? "GET";
        // Static O(1) (two-level map, no key concat), then the per-method dynamic list.
        let route = this.#static.get(method)?.get(pathname);
        let params = EMPTY_BAG;
        if (!route) {
            const candidates = this.#dynamic.get(method);
            if (candidates) {
                for (const r of candidates) {
                    const m = r.matcher.exec(pathname);
                    if (!m)
                        continue;
                    const names = r.paramNames;
                    const p = {};
                    for (let i = 0; i < names.length; i++)
                        p[names[i]] = decodeURIComponent(m[i + 1]);
                    params = p;
                    route = r;
                    break;
                }
            }
        }
        if (!route)
            return Response.json({ error: "Not Found" }, { status: 404 });
        // Parse the query string only when present (skip the no-query common case).
        const qs = qi === -1 ? "" : rawUrl.slice(qi + 1);
        let query = qs
            ? Object.fromEntries(new URLSearchParams(qs))
            : EMPTY_BAG;
        let body;
        if (route.needsBody)
            body = await readBody(req);
        // ── Input validation (coerces) ──
        const schema = route.schema;
        if (schema) {
            const code = schema.invalidStatus;
            if (schema.params)
                params = validate(schema.params, params, code);
            if (schema.query)
                query = validate(schema.query, query, code);
            if (schema.body)
                body = validate(schema.body, body, code);
        }
        ctx.params = params;
        ctx.query = query;
        ctx.body = body;
        // Per-route middleware wraps guards+interceptors+handler. With neither
        // middleware nor interceptors → inline (no hop); otherwise route through
        // #runRoute (the single place guards + interceptors + handler compose).
        const mws = route.middleware;
        let result;
        if (mws.length === 0 && !route.interceptors?.length) {
            if (route.guards) {
                for (const g of route.guards) {
                    if ((await g(ctx)) === false)
                        throw new HttpError(403, { error: "Forbidden" });
                }
            }
            result = await route.handler(ctx);
        }
        else {
            result = await runMiddleware(mws, ctx, () => this.#runRoute(ctx, route));
        }
        // ── Output validation, keyed by the status the handler chose ──
        const status = isResult(result) ? result.status : 200;
        if (schema?.response && !res.writableEnded) {
            const outSchema = responseSchemaFor(schema.response, status);
            if (outSchema) {
                const raw = isResult(result) ? result.body : result;
                let validated;
                try {
                    validated = validate(outSchema, raw);
                }
                catch (e) {
                    // A bad response is a server bug, not a client error.
                    throw new HttpError(500, {
                        error: "Response validation failed",
                        issues: e instanceof ValidationError ? e.issues : undefined,
                    });
                }
                if (isResult(result))
                    result.body = validated;
                else
                    result = validated;
            }
        }
        ctx._serializer = route.serializers?.[status];
        return result;
    };
    // Global middleware wrap routing, so they see every request — 404s, CORS
    // preflight, rate-limit — not just matched routes.
    #handle = (ctx) => this.#globalMw.length === 0
        ? this.#resolve(ctx)
        : runMiddleware(this.#globalMw, ctx, () => this.#resolve(ctx));
    async #dispatch(req, res) {
        // Correlation id: honour an incoming one, else mint a cheap one; echo it back.
        const incoming = req.headers["x-request-id"];
        const requestId = (typeof incoming === "string" && incoming) || fastId();
        res.setHeader("x-request-id", requestId);
        // The context exists before routing so global middleware (and `context()`)
        // can use it; `#resolve` fills params/query/body once a route is matched.
        const ctx = new HttpContext(req, res, EMPTY_BAG, EMPTY_BAG, undefined, requestId);
        try {
            // Everything runs inside the async context (so logging/tracing anywhere
            // recover `requestId`). `#handle` is a hoisted arrow — no per-request closure.
            const result = await requestContext.run(ctx, this.#handle, ctx);
            // Send once, at the outermost level, so a middleware's transformed/returned
            // value flows up to here. A streaming handler (SSE) already wrote → skip.
            if (!res.headersSent) {
                const pending = send(res, result, negotiate(req.headers.accept), ctx._serializer);
                if (pending)
                    await pending;
            }
        }
        catch (err) {
            if (err instanceof HttpError) {
                if (!res.headersSent) {
                    const desc = typeof err.payload === "string"
                        ? Response.text(err.payload, { status: err.status })
                        : Response.json(err.payload, { status: err.status });
                    await send(res, desc, negotiate(req.headers.accept));
                }
                else if (!res.writableEnded) {
                    res.end();
                }
                return;
            }
            console.error(err);
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Internal Server Error" }));
            }
            else if (!res.writableEnded) {
                res.end();
            }
        }
    }
    #upgrade(req, socket) {
        const url = new URL(req.url ?? "/", "http://localhost");
        const route = this.#wsRoutes.find((r) => r.matcher.test(url.pathname));
        const key = req.headers["sec-websocket-key"];
        if (!route || !key) {
            socket.destroy();
            return;
        }
        const accept = createHash("sha1")
            .update(key + WS_GUID)
            .digest("base64");
        socket.write("HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
        const ws = new WsConnection(socket);
        const { handlers } = route;
        handlers.open?.(ws);
        ws.on("message", async (msg) => {
            try {
                const out = handlers.message?.(ws, msg);
                if (isStreamable(out)) {
                    for await (const chunk of out) {
                        ws.send(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
                    }
                }
                else {
                    await out;
                }
            }
            catch (err) {
                console.error(err);
                ws.close(1011);
            }
        });
        ws.on("close", () => handlers.close?.(ws));
    }
}
function generateOpenAPI(routes, info) {
    const paths = {};
    for (const r of routes.http) {
        if (r.hidden)
            continue;
        const oaPath = r.path.replace(/:([^/]+)/g, "{$1}");
        const operation = {};
        const parameters = [];
        const pathParams = [...r.path.matchAll(/:([^/]+)/g)].map((m) => m[1]);
        const paramsJson = r.schema?.params ? toJsonSchema(r.schema.params) : undefined;
        for (const name of pathParams) {
            parameters.push({
                name,
                in: "path",
                required: true,
                schema: paramsJson?.properties?.[name] ?? { type: "string" },
            });
        }
        if (r.schema?.query) {
            const q = toJsonSchema(r.schema.query);
            const required = new Set(q.required ?? []);
            for (const [name, schema] of Object.entries(q.properties ?? {})) {
                parameters.push({ name, in: "query", required: required.has(name), schema });
            }
        }
        if (parameters.length)
            operation.parameters = parameters;
        if (r.schema?.body) {
            operation.requestBody = {
                required: true,
                content: { "application/json": { schema: toJsonSchema(r.schema.body) } },
            };
        }
        const responses = {};
        const resp = r.schema?.response;
        if (resp && isSchema(resp)) {
            responses["200"] = jsonContent("OK", resp);
        }
        else if (resp) {
            for (const [status, schema] of Object.entries(resp)) {
                responses[status] = jsonContent(`Response ${status}`, schema);
            }
        }
        else {
            responses["200"] = { description: "OK" };
        }
        operation.responses = responses;
        // Guard/interceptor self-descriptions (harvested via the `describing` pass):
        // surface them as the operation description + an `x-guards` vendor extension.
        if (r.meta?.length) {
            const descriptions = r.meta.map((m) => m.description).filter(Boolean);
            if (descriptions.length)
                operation.description = descriptions.join("\n");
            operation["x-guards"] = r.meta.map(({ name, description }) => ({ name, description }));
        }
        (paths[oaPath] ??= {})[r.method.toLowerCase()] = operation;
    }
    return {
        openapi: "3.1.0",
        info: { title: info?.title ?? "API", version: info?.version ?? "1.0.0" },
        paths,
    };
}
function jsonContent(description, schema) {
    return {
        description,
        content: { "application/json": { schema: toJsonSchema(schema) } },
    };
}
function generateAsyncAPI(routes, info) {
    const channels = {};
    for (const w of routes.ws) {
        const channel = {};
        const schema = w.handlers.schema;
        // AsyncAPI 2.x is from the application's perspective:
        //   publish   = clients send to us (incoming `message`)
        //   subscribe = we send to clients (outgoing `response`)
        if (schema?.message) {
            channel.publish = { message: { payload: toJsonSchema(schema.message) } };
        }
        if (schema?.response) {
            channel.subscribe = { message: { payload: toJsonSchema(schema.response) } };
        }
        channels[w.path] = channel;
    }
    // SSE is server -> client only: subscribe-only channel.
    for (const s of routes.sse) {
        const event = s.handlers.schema?.event;
        channels[s.path] = {
            subscribe: {
                bindings: { http: { type: "sse" } },
                message: { payload: event ? toJsonSchema(event) : {} },
            },
        };
    }
    return {
        asyncapi: "2.6.0",
        info: { title: info?.title ?? "Realtime API", version: info?.version ?? "1.0.0" },
        channels,
    };
}
class AppBuilder {
    #http = [];
    #ws = [];
    #sse = [];
    #middleware = [];
    // Mounted controller instances, kept so their disposers can run at shutdown.
    #controllers = [];
    #plugins = [];
    #disposed = false;
    constructor(controllers) {
        for (const Ctrl of controllers)
            this.controller(Ctrl);
    }
    /**
     * Register one or more {@link ServerPlugin}s. `setup` runs now (so a plugin can
     * add middleware/routes before the server is built); `onListen`/`onShutdown`
     * run when the server starts/drains.
     */
    plugin(...plugins) {
        for (const p of plugins) {
            this.#plugins.push(p);
            p.setup?.(this);
        }
        return this;
    }
    // Plugin onShutdown hooks, reverse order (LIFO — mirror controller disposal).
    #runShutdown = async () => {
        for (let i = this.#plugins.length - 1; i >= 0; i--) {
            try {
                await this.#plugins[i].onShutdown?.();
            }
            catch {
                /* a plugin's shutdown must not block the rest of the drain */
            }
        }
    };
    // Plugin onListen hooks, registration order, after the socket is bound.
    #runOnListen = async (http) => {
        for (const p of this.#plugins) {
            try {
                await p.onListen?.(http);
            }
            catch (err) {
                console.error(`[plugin ${p.name}] onListen failed`, err);
            }
        }
    };
    /**
     * Register middleware (Express-style, onion model). Two forms:
     *   `app.use(mw, …)`            — global: wraps routing, sees every request
     *                                 (404s, CORS preflight, rate-limit, logging).
     *   `app.use("/admin", mw, …)`  — scoped: runs only for routes under that path
     *                                 prefix (per-route / per-group middleware).
     * Runs in registration order; global wraps, scoped runs inside per matched route.
     */
    use(pathOrMw, ...rest) {
        if (typeof pathOrMw === "string") {
            const prefix = normalizePath(pathOrMw);
            for (const mw of rest)
                this.#middleware.push({ prefix, mw });
        }
        else {
            for (const mw of [pathOrMw, ...rest])
                this.#middleware.push({ mw });
        }
        return this;
    }
    /** Mount a decorator-based controller class. */
    controller(Ctrl) {
        const instance = new Ctrl(); // runs initializers -> fills the registry
        // Install providers once on the singleton instance (adds `this.orm` etc.),
        // before handlers bind so they're present for the first request.
        for (const p of Ctrl.providers ?? [])
            p.install(instance);
        this.#controllers.push(instance);
        const base = Ctrl.basePath ?? "";
        const classGuards = Ctrl.guards ?? [];
        const classInterceptors = Ctrl.interceptors ?? [];
        const classMiddlewares = Ctrl.middlewares ?? [];
        for (const route of getRoutes(Ctrl)) {
            if (route.protocol !== "http")
                continue;
            const handler = instance[route.handlerName].bind(instance);
            // class-level guards run first, then the handler's own guards
            const guards = [...classGuards, ...getGuards(Ctrl, route.handlerName)];
            // class-level interceptors wrap outermost, then the handler's own ones
            const interceptors = [...classInterceptors, ...getInterceptors(Ctrl, route.handlerName)];
            // class-level middleware runs first, then the handler's own (both outside guards)
            const middlewares = [...classMiddlewares, ...getMiddlewares(Ctrl, route.handlerName)];
            this.#http.push({
                method: route.trigger,
                path: normalizePath(base + route.path),
                handler,
                schema: route.schema,
                guards: guards.length ? guards : undefined,
                interceptors: interceptors.length ? interceptors : undefined,
                middlewares: middlewares.length ? middlewares : undefined,
                controller: Ctrl.name,
            });
        }
        return this;
    }
    /**
     * Introspect the registered routes, controllers, middleware and ws/sse handlers
     * into a serializable snapshot — for tooling such as `@youneed/server-devtools`
     * (topology view, security audit, OpenAPI). Call it after the routes/controllers
     * are registered (before or after `listen`).
     */
    topology() {
        const resp = (r) => {
            if (!r)
                return undefined;
            if (isSchema(r))
                return toJsonSchema(r);
            const map = r;
            const pick = map[200] ?? Object.values(map)[0];
            return pick ? toJsonSchema(pick) : undefined;
        };
        const part = (s) => (s ? toJsonSchema(s) : undefined);
        const routes = [];
        for (const r of this.#http) {
            if (r.hidden)
                continue;
            routes.push({
                method: r.method.toUpperCase(),
                path: r.path,
                controller: r.controller,
                guards: r.guards?.length ?? 0,
                guardNames: r.guards?.map(guardDocName) ?? [],
                guardDocs: r.guards?.map((g) => {
                    const d = g.doc; // string (legacy) or { name, … }
                    return typeof d === "object" && d ? { name: d.name ?? g.name ?? "guard", description: d.description } : { name: guardDocName(g) };
                }) ?? [],
                interceptors: r.interceptors?.length ?? 0,
                kind: "http",
                schema: r.schema
                    ? { params: part(r.schema.params), query: part(r.schema.query), body: part(r.schema.body || undefined), response: resp(r.schema.response) }
                    : undefined,
            });
        }
        for (const w of this.#ws)
            routes.push({ method: "WS", path: w.path, guards: 0, guardNames: [], guardDocs: [], interceptors: 0, kind: "ws" });
        for (const s of this.#sse)
            routes.push({ method: "SSE", path: s.path, guards: 0, guardNames: [], guardDocs: [], interceptors: 0, kind: "sse" });
        const plugins = this.#plugins.map((p) => {
            let info;
            try {
                info = p.inspect?.();
            }
            catch {
                /* a plugin's inspect must not break topology introspection */
            }
            return info === undefined ? { name: p.name } : { name: p.name, info };
        });
        return { routes, middleware: this.#middleware.map((m) => m.mw.name || "middleware"), plugins };
    }
    /**
     * Run the guards of one route against synthetic input (headers/params/query/body)
     * and report each guard's verdict — WITHOUT running the handler. Powers the
     * devtools "try a guard" panel. Guards run in order, stopping at the first that
     * denies (`return false` → `denied 403`) or throws (`HttpError` → `denied` with
     * its status, anything else → `error 500`); the rest are `skipped`.
     */
    async tryGuards(method, path, init = {}) {
        const m = method.toUpperCase();
        const route = this.#http.find((r) => r.method.toUpperCase() === m && r.path === path);
        if (!route)
            return [{ name: "(route)", outcome: "error", message: `no ${m} route at ${path}` }];
        const guards = route.guards ?? [];
        const ctx = stubContext(m, path, init);
        const trials = [];
        let stopped = false;
        for (const g of guards) {
            const name = guardDocName(g);
            if (stopped) {
                trials.push({ name, outcome: "skipped" });
                continue;
            }
            try {
                const ok = await g(ctx);
                if (ok === false) {
                    trials.push({ name, outcome: "denied", status: 403 });
                    stopped = true;
                }
                else {
                    trials.push({ name, outcome: "passed" });
                }
            }
            catch (e) {
                if (e instanceof HttpError) {
                    trials.push({ name, outcome: "denied", status: e.status, message: typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload) });
                }
                else {
                    trials.push({ name, outcome: "error", status: 500, message: e instanceof Error ? e.message : String(e) });
                }
                stopped = true;
            }
        }
        return trials;
    }
    get(path, handler, schema) {
        return this.#add("GET", path, handler, schema);
    }
    post(path, handler, schema) {
        return this.#add("POST", path, handler, schema);
    }
    put(path, handler, schema) {
        return this.#add("PUT", path, handler, schema);
    }
    patch(path, handler, schema) {
        return this.#add("PATCH", path, handler, schema);
    }
    delete(path, handler, schema) {
        return this.#add("DELETE", path, handler, schema);
    }
    /** HTTP QUERY (safe, idempotent, body-carrying — RFC 9110-style). Use for
     *  reads whose query is too large/structured for the URL; responses are
     *  cacheable by content (see `createCache`). The query lives in `ctx.body`. */
    query(path, handler, schema) {
        return this.#add("QUERY", path, handler, schema);
    }
    ws(path, handlers) {
        this.#ws.push({ path: normalizePath(path), handlers });
        return this;
    }
    /** Server-Sent Events stream — same handler shape spirit as `.ws`. */
    sse(path, handlers) {
        const p = normalizePath(path);
        this.#sse.push({ path: p, handlers });
        // An SSE endpoint is a regular GET that takes over the socket; hidden from
        // OpenAPI (it shows up in AsyncAPI as a stream instead).
        this.#http.push({
            method: "GET",
            path: p,
            hidden: true,
            handler: (ctx) => startSse(ctx.request, ctx.response, handlers),
        });
        return this;
    }
    /**
     * Mount any document generator at a GET path. The generator receives the
     * collected route metadata and returns a JSON-serializable spec. This is
     * the extension point — `.openapi()` / `.asyncapi()` are presets over it.
     */
    document(path, generate) {
        let cached;
        this.#http.push({
            method: "GET",
            path: normalizePath(path),
            hidden: true,
            // Lazy: generated on first request, after all routes are registered. The
            // guard/interceptor `meta` is harvested first so the spec can describe them.
            handler: async () => {
                await this.#collectMeta();
                return Response.json((cached ??= generate({ http: this.#http, ws: this.#ws, sse: this.#sse })));
            },
        });
        return this;
    }
    // Harvest each route's guard/interceptor `meta` ONCE (the first time any doc is
    // generated) by running them against a `describing` probe context — off the
    // request hot path entirely. Annotators that declare `ctx.meta` before their
    // I/O (or short-circuit on `ctx.describing`) are documented; throws are ignored.
    #metaCollected = false;
    async #collectMeta() {
        if (this.#metaCollected)
            return;
        this.#metaCollected = true;
        for (const route of this.#http) {
            const annotators = [...(route.guards ?? []), ...(route.interceptors ?? [])];
            if (!annotators.length)
                continue;
            const collected = [];
            for (const fn of annotators) {
                const ctx = describeContext(route.method, route.path);
                try {
                    await fn(ctx, () => Promise.resolve(undefined));
                }
                catch {
                    // only the meta declared before any failure matters
                }
                if (hasOwnKeys(ctx.meta))
                    collected.push(ctx.meta);
            }
            if (collected.length)
                route.meta = collected;
        }
    }
    openapi(opts) {
        return this.document(opts?.path ?? "/openapi.json", (routes) => generateOpenAPI(routes, opts));
    }
    asyncapi(opts) {
        return this.document(opts?.path ?? "/asyncapi.json", (routes) => generateAsyncAPI(routes, opts));
    }
    #add(method, path, handler, schema) {
        // A bare descriptor (File("x"), Response({...})) becomes a constant route.
        const fn = isResult(handler)
            ? () => handler
            : handler;
        this.#http.push({ method, path: normalizePath(path), handler: fn, schema });
        return this;
    }
    buildHTTP(opts = {}) {
        return new HttpTransport(this.#http, this.#ws, this.#middleware).build(
        // Drain order: plugins first (LIFO), then mounted controllers.
        async () => {
            await this.#runShutdown();
            await this.#disposeControllers();
        }, opts);
    }
    listen(port, optsOrCb, cb) {
        const opts = typeof optsOrCb === "function" ? {} : optsOrCb;
        const done = typeof optsOrCb === "function" ? optsOrCb : cb;
        // A plugin may TAKE OVER the bind (cluster primary forks workers instead of
        // listening). It returns a non-listening stub whose drain still runs the
        // plugin onShutdown hooks (so the primary forwards signals to its workers).
        for (const p of this.#plugins) {
            if (p.beforeListen?.({ port, opts }) === false) {
                const stub = new HTTP({ listening: false }, () => this.#runShutdown());
                done(stub);
                return stub;
            }
        }
        const http = this.buildHTTP(opts);
        // Run plugin onListen once bound, then hand the server to the caller.
        http.listen(port, (h) => void this.#runOnListen(h).finally(() => done(h)), opts.host);
        return http;
    }
    // Dispose every mounted controller (LIFO). Idempotent, so disposing the
    // returned HTTP and the builder itself can't double-release a controller.
    #disposeControllers() {
        if (this.#disposed)
            return Promise.resolve();
        this.#disposed = true;
        return disposeAll(this.#controllers);
    }
    /** `await using app = Application(...)` releases controllers on scope exit. */
    async [Symbol.asyncDispose]() {
        await this.#disposeControllers();
    }
}
function Application(...controllers) {
    return new AppBuilder(controllers);
}
// ============================================================
// Path helpers
// ============================================================
function normalizePath(path) {
    const cleaned = ("/" + path).replace(/\/+/g, "/").replace(/\/$/, "");
    return cleaned === "" ? "/" : cleaned;
}
function compilePath(path) {
    const paramNames = [];
    const pattern = path.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return "([^/]+)";
    });
    return { matcher: new RegExp(`^${pattern}$`), paramNames };
}
// Per-request body byte cap, stamped by the `bodyLimit` middleware.
const BODY_LIMIT = Symbol("bodyLimit");
const RAW_BODY = Symbol("rawBody");
/**
 * Drain the request stream into a Buffer, enforcing the `bodyLimit`. The result
 * is memoized on the request, so a second caller (e.g. the QUERY cache hashing
 * the body for its key, then `readBody` parsing it) reuses the same bytes
 * instead of trying to re-read an already-consumed stream.
 */
async function collectRaw(req) {
    const cached = req[RAW_BODY];
    if (cached !== undefined)
        return cached;
    const limit = req[BODY_LIMIT];
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buf = chunk;
        total += buf.length;
        if (limit !== undefined && total > limit) {
            throw new HttpError(413, { error: "Payload Too Large", limit });
        }
        chunks.push(buf);
    }
    const raw = Buffer.concat(chunks);
    req[RAW_BODY] = raw;
    return raw;
}
/**
 * The exact raw request-body bytes, memoized on the request. Safe to call from a
 * middleware AND have the handler still receive a parsed `ctx.body` — both share
 * the one drained buffer (no double-read of the consumed stream). Used by
 * signature-verifying middleware (`@youneed/server-middleware-webhook-signature`)
 * that must hash the bytes exactly as the client sent them.
 */
function rawBody(source) {
    const req = (source.request ?? source);
    return collectRaw(req);
}
async function readBody(req) {
    const raw = await collectRaw(req);
    if (raw.length === 0)
        return undefined;
    // Lowercase only for type detection — the multipart boundary is case-sensitive
    // (Bun uses `WebkitFormBoundary…`), so extract it from the original header.
    const rawType = String(req.headers["content-type"] ?? "");
    const type = rawType.toLowerCase();
    if (type.includes("application/json")) {
        const text = raw.toString("utf8");
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }
    if (type.includes("application/x-www-form-urlencoded")) {
        return Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
    }
    if (type.includes("multipart/form-data")) {
        const boundary = /boundary=("?)([^";]+)\1/i.exec(rawType)?.[2];
        return boundary ? parseMultipart(raw, boundary) : raw;
    }
    // Text stays a string; anything else (octet-stream, images, file chunks) is a
    // Buffer so binary survives intact.
    if (type === "" || type.startsWith("text/"))
        return raw.toString("utf8");
    return raw;
}
const CRLF2 = Buffer.from("\r\n\r\n");
function splitBuffer(buf, sep) {
    const parts = [];
    let start = 0;
    let i;
    while ((i = buf.indexOf(sep, start)) !== -1) {
        parts.push(buf.subarray(start, i));
        start = i + sep.length;
    }
    parts.push(buf.subarray(start));
    return parts;
}
/** Parse a buffered multipart/form-data body into fields + files. */
function parseMultipart(buf, boundary) {
    const fields = {};
    const files = [];
    for (let part of splitBuffer(buf, Buffer.from(`--${boundary}`))) {
        if (part.length === 0)
            continue;
        if (part[0] === 0x0d && part[1] === 0x0a)
            part = part.subarray(2); // leading CRLF
        if (part.length >= 2 && part[0] === 0x2d && part[1] === 0x2d)
            continue; // closing "--"
        const sep = part.indexOf(CRLF2);
        if (sep === -1)
            continue;
        const rawHeaders = part.subarray(0, sep).toString("utf8");
        let body = part.subarray(sep + CRLF2.length);
        if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
            body = body.subarray(0, body.length - 2); // trailing CRLF before next boundary
        }
        const headers = {};
        for (const line of rawHeaders.split("\r\n")) {
            const c = line.indexOf(":");
            if (c !== -1)
                headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
        }
        const cd = headers["content-disposition"] ?? "";
        const name = /name="([^"]*)"/.exec(cd)?.[1];
        if (name === undefined)
            continue;
        const filename = /filename="([^"]*)"/.exec(cd)?.[1];
        if (filename !== undefined) {
            files.push({ name, filename, contentType: headers["content-type"], data: Buffer.from(body) });
        }
        else {
            fields[name] = body.toString("utf8");
        }
    }
    return { fields, files };
}
// ============================================================
// Serialization — value-owned (Symbol.toSerialize), with negotiation
// ------------------------------------------------------------
// A value's own [Symbol.toSerialize](value, kind) wins; otherwise a generic
// per-format encoder handles plain objects so content negotiation still works.
// ============================================================
function escapeXml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
// Generic fallback encoders for values that don't own a representation.
function toXml(value, tag = "root") {
    if (value === null || value === undefined)
        return `<${tag}/>`;
    if (Array.isArray(value))
        return value.map((v) => toXml(v, "item")).join("");
    if (typeof value === "object") {
        const inner = Object.entries(value)
            .map(([k, v]) => toXml(v, k))
            .join("");
        return `<${tag}>${inner}</${tag}>`;
    }
    return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}
function toFix(value) {
    if (typeof value !== "object" || value === null)
        return String(value);
    // real FIX uses SOH (\x01) + numeric tags; "|" + keys here for readability
    return Object.entries(value)
        .map(([k, v]) => `${k}=${v}`)
        .join("|");
}
const formatEncoders = {
    json: (v) => JSON.stringify(v),
    xml: (v) => toXml(v),
    fix: (v) => toFix(v),
};
function contentTypeOf(kind) {
    switch (kind) {
        case "xml":
            return "application/xml; charset=utf-8";
        case "fix":
            return "application/fix";
        default:
            return "application/json";
    }
}
function parseAccept(accept) {
    return accept.split(",").map((part) => {
        const [type, ...params] = part.trim().split(";");
        const qParam = params.find((p) => p.trim().startsWith("q="));
        const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
        return { type: type.trim().toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    });
}
// Accept headers are low-cardinality (a handful of clients) — cache the parse.
const negotiationCache = new Map();
function negotiate(accept) {
    if (!accept)
        return "json";
    let kind = negotiationCache.get(accept);
    if (kind === undefined) {
        kind = chooseKind(accept);
        if (negotiationCache.size > 256)
            negotiationCache.clear();
        negotiationCache.set(accept, kind);
    }
    return kind;
}
function chooseKind(accept) {
    if (!accept)
        return "json";
    const entries = parseAccept(accept);
    // Browser heuristic: a client asking for text/html (which we don't serve)
    // is a browser, not an API client wanting XML/FIX — default it to JSON.
    if (entries.some((e) => e.type === "text/html"))
        return "json";
    const best = (types) => Math.max(0, ...entries.filter((e) => types.includes(e.type)).map((e) => e.q));
    // JSON listed first so it wins ties (the sane default).
    const ranked = [
        ["json", best(["application/json", "*/*"])],
        ["xml", best(["application/xml", "text/xml"])],
        ["fix", best(["application/fix"])],
    ];
    ranked.sort((a, b) => b[1] - a[1]);
    return ranked[0][1] > 0 ? ranked[0][0] : "json";
}
/** Handler that always responds in a fixed format, ignoring Accept. */
function respondAs(make, kind) {
    return (ctx) => {
        ctx.response.writeHead(200, { "Content-Type": contentTypeOf(kind) });
        ctx.response.end(serialize(make(), kind));
    };
}
/** Variant 1: the value owns its representation; generic encoder otherwise. */
function serialize(value, kind) {
    const own = value?.[Symbol.toSerialize];
    if (typeof own === "function") {
        const out = own.call(value, value, kind);
        return typeof out === "string" ? out : JSON.stringify(out);
    }
    const encode = formatEncoders[kind];
    return encode ? encode(value) : String(value);
}
// ============================================================
// Public API
// ============================================================
export { 
// App composition
Application, Controller, 
// Guard/interceptor documentation wrappers
withDocumentation, guardWithDocumentation, 
// Response descriptors
Response, File, cacheControl, clearSiteData, 
// Schema / validation
t, validate, isSchema, toJsonSchema, 
// Errors
HttpError, ValidationError, 
// Request-scoped context
context, trace, 
// Response cache (bound to the serialization/send engine, so it lives in core)
createCache, createDistributedCache, 
// Primitives the @youneed/server-middleware-* packages build on
isResult, appendVary as vary, BODY_LIMIT, rawBody, 
// Serialization / content negotiation
serialize, negotiate, contentTypeOf, respondAs, };
