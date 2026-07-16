import { createReadStream } from "node:fs";
import { Buffer } from "node:buffer";
import { extname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import type { Duplex } from "node:stream";
import { gzip, brotliCompress } from "node:zlib";
import { EventEmitter } from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  Server,
  IncomingMessage,
  ServerResponse,
  OutgoingHttpHeaders,
} from "node:http";
import {
  createServer as createHttp2Cleartext,
  createSecureServer as createHttp2Secure,
} from "node:http2";
import type { Http2Server, Http2SecureServer, Http2Session, ServerHttp2Stream } from "node:http2";
import { createRegistry, ctorOf } from "@youneed/core";
import type { MaybePromise } from "@youneed/core";

// ============================================================
// Public request/response types
// ============================================================

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
 * A runtime-agnostic Node-style request listener `(req, res) => void`. Returned by
 * {@link AppBuilder.handler}; mount it on any `node:http`-compatible server, or
 * bridge it to a Web `fetch` handler with `@youneed/server-adapter`.
 */
export type NodeRequestListener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Elysia-style handler: it receives a single `Context` and *returns* a value
 * that the framework serializes. `ctx.response` is there for manual streaming.
 */
type HttpHandler = (ctx: Context) => MaybePromise<unknown>;

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

interface HttpResult {
  readonly [RESULT]: true;
  readonly [OWNS_STREAM]?: true;
  status: number;
  headers: OutgoingHttpHeaders;
  body: unknown;
}

function isResult(value: unknown): value is HttpResult {
  return (
    typeof value === "object" && value !== null && (value as any)[RESULT] === true
  );
}

function Response(opts?: {
  status?: number;
  headers?: OutgoingHttpHeaders;
  body?: unknown;
}): HttpResult {
  return {
    [RESULT]: true,
    status: opts?.status ?? 200,
    headers: opts?.headers ?? {},
    body: opts?.body,
  };
}

type BodyOpts = { status?: number; headers?: OutgoingHttpHeaders };

/** Send a JSON payload without boilerplate: `Response.json(value, { status })`. */
Response.json = (body: unknown, opts?: BodyOpts): HttpResult =>
  Response({
    status: opts?.status,
    headers: { "Content-Type": "application/json", ...opts?.headers },
    body, // kept as a value so output validation can inspect it; serialized in sendBody
  });

/** Send a plain-text payload without boilerplate: `Response.text(str, { status })`. */
Response.text = (body: unknown, opts?: BodyOpts): HttpResult =>
  Response({
    status: opts?.status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...opts?.headers },
    body: String(body),
  });

const MIME: Record<string, string> = {
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
function cacheControl(d: CacheControl): string {
  const parts: string[] = [];
  if (d.public) parts.push("public");
  if (d.private) parts.push("private");
  if (d.noCache) parts.push("no-cache");
  if (d.noStore) parts.push("no-store");
  if (d.noTransform) parts.push("no-transform");
  if (d.mustRevalidate) parts.push("must-revalidate");
  if (d.proxyRevalidate) parts.push("proxy-revalidate");
  if (d.mustUnderstand) parts.push("must-understand");
  if (d.immutable) parts.push("immutable");
  if (d.maxAge !== undefined) parts.push(`max-age=${d.maxAge}`);
  if (d.sMaxage !== undefined) parts.push(`s-maxage=${d.sMaxage}`);
  if (d.staleWhileRevalidate !== undefined) parts.push(`stale-while-revalidate=${d.staleWhileRevalidate}`);
  if (d.staleIfError !== undefined) parts.push(`stale-if-error=${d.staleIfError}`);
  return parts.join(", ");
}

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
function clearSiteData(...types: ClearSiteDataDirective[]): string {
  return (types.length ? types : ["*"]).map((t) => `"${t}"`).join(", ");
}

interface FileOptions {
  status?: number;
  headers?: OutgoingHttpHeaders;
  /** `Cache-Control` for this file — a raw header string, or {@link CacheControl}
   *  directives serialized for you. An explicit `headers["Cache-Control"]` wins. */
  cacheControl?: string | CacheControl;
}

function File(path: string, opts?: FileOptions): HttpResult {
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  const cc = opts?.cacheControl;
  const cacheHeader = cc === undefined ? undefined : typeof cc === "string" ? cc : cacheControl(cc);
  // A bare `File(...)` can be registered as a CONSTANT route — the server reuses
  // the single descriptor for every request. A baked-in `createReadStream` would
  // be exhausted after the first response (the next request streams 0 bytes), so
  // expose `body` as a getter that opens a FRESH stream on each read. Every
  // request — including concurrent ones — gets its own, while `() => File(...)`
  // keeps working too. `set body` honors the output-validation write-back path.
  let override: unknown;
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
    get body(): unknown {
      return overridden ? override : createReadStream(path);
    },
    set body(v: unknown) {
      override = v;
      overridden = true;
    },
  };
}

// Anything with an (async) iterator that isn't a string/array — i.e. a
// generator or stream-like source we should stream chunk by chunk.
function isStreamable(value: any): boolean {
  return (
    value != null &&
    (typeof value[Symbol.asyncIterator] === "function" ||
      (typeof value.next === "function" &&
        typeof value[Symbol.iterator] === "function"))
  );
}

// ============================================================
// Response serialization
// ============================================================

// `send`/`sendBody` are deliberately *not* `async`: the common cases (object,
// string, buffer) finish synchronously and return `undefined`, so the hot path
// pays no extra promise/microtask. Only streaming bodies return a Promise —
// callers do `const p = send(...); if (p) await p;`.
function send(
  res: HttpResponse,
  value: unknown,
  kind: SerializeKind = "json",
  serializer?: (v: unknown) => string,
): void | Promise<void> {
  if (res.writableEnded) return; // handler already wrote manually

  if (isResult(value)) {
    res.statusCode = value.status;
    const headers = value.headers;
    // Capture the declared Content-Type while iterating, so sendBody doesn't
    // have to call res.getHeader() back out again on the hot path.
    let ct: string | undefined;
    for (const key in headers) {
      const val = headers[key];
      if (val !== undefined) {
        res.setHeader(key, val as string | string[] | number);
        if (key.length === 12 && key.toLowerCase() === "content-type") ct = String(val);
      }
    }
    return sendBody(res, value.body, kind, serializer, ct);
  }

  return sendBody(res, value, kind, serializer);
}

function sendBody(
  res: HttpResponse,
  body: unknown,
  kind: SerializeKind,
  serializer?: (v: unknown) => string,
  ctHint?: string,
): void | Promise<void> {
  if (body === undefined || body === null) {
    if (res.statusCode === 200) res.statusCode = 204;
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
    return streamIterable(res, body as AsyncIterable<unknown>);
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
function pipeStream(res: HttpResponse, body: Readable): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    body.on("error", reject);
    res.on("close", resolve);
    body.pipe(res);
  });
}

async function streamIterable(
  res: HttpResponse,
  body: AsyncIterable<unknown>,
): Promise<void> {
  for await (const chunk of body) {
    res.write(
      typeof chunk === "string" || Buffer.isBuffer(chunk) ? chunk : JSON.stringify(chunk),
    );
  }
  res.end();
}

function setDefaultType(res: HttpResponse, type: string) {
  if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", type);
}

// ============================================================
// Errors — any handler/validator may throw to send any status code
// ============================================================

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(typeof payload === "string" ? payload : `HttpError ${status}`);
  }
}

interface Issue {
  path: string;
  message: string;
}

class ValidationError extends HttpError {
  /** Default 422; pass another code to honour the "any status" invariant. */
  constructor(
    readonly issues: Issue[],
    status = 422,
  ) {
    super(status, { error: "Validation failed", issues });
  }
}

// ============================================================
// Minimal schema/validation layer (TypeBox/Zod-lite)
// ============================================================

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

// A general, format-agnostic serialization protocol that mirrors
// Symbol.toPrimitive: `[Symbol.toSerialize](value, kind)`. The `kind`
// discriminator selects the target format; a new format (xml, fix, …) is just
// another `kind` branch — no new method and no framework changes.
declare global {
  interface SymbolConstructor {
    readonly toSerialize: unique symbol;
    // Explicit resource management (TC39). Augmented here so the framework can
    // reference them under an ES2022 lib that predates `lib.esnext.disposable`.
    readonly dispose: unique symbol;
    readonly asyncDispose: unique symbol;
  }
}
(Symbol as { toSerialize?: symbol }).toSerialize ??= Symbol("Symbol.toSerialize");
// Polyfill the disposal symbols when the runtime lacks them (Node < 20).
(Symbol as { dispose?: symbol }).dispose ??= Symbol.for("nodejs.dispose");
(Symbol as { asyncDispose?: symbol }).asyncDispose ??= Symbol.for("nodejs.asyncDispose");

/** Open string union — built-ins plus any custom format. */
type SerializeKind = "json" | "xml" | "fix" | (string & {});

/** Describe a schema in the given format (default JSON Schema, for OpenAPI). */
function toJsonSchema(schema: Schema, kind: SerializeKind = "json"): JsonSchema {
  const serializer = schema[Symbol.toSerialize];
  return (serializer ? serializer.call(schema, undefined, kind) : {}) as JsonSchema;
}

type Infer<S> = S extends Schema<infer T> ? T : never;

function isSchema(value: unknown): value is Schema {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any)._check === "function"
  );
}

/** Run a schema against a value; throws ValidationError if anything failed. */
function validate<T>(schema: Schema<T>, value: unknown, status?: number): T {
  const issues: Issue[] = [];
  const result = schema._check(value, "", issues);
  if (issues.length) throw new ValidationError(issues, status);
  return result;
}

/** Map our metadata onto JSON Schema keywords. */
function jsonMeta(m: SchemaMeta): JsonSchema {
  const out: JsonSchema = {};
  if (m.title !== undefined) out.title = m.title;
  if (m.description !== undefined) out.description = m.description;
  if (m.examples !== undefined) out.examples = m.examples;
  else if (m.example !== undefined) out.examples = [m.example];
  return out;
}

type SchemaBase<T> = {
  _check: Schema<T>["_check"];
  optional?: boolean;
  _meta?: SchemaMeta;
  [Symbol.toSerialize]?: (value: unknown, kind: SerializeKind) => unknown;
};

/**
 * Wraps a raw schema definition with a chainable `.meta()` (zod-style).
 * `.meta()` returns a NEW schema whose JSON description carries the metadata,
 * leaving the original untouched.
 */
function defineSchema<T>(base: SchemaBase<T>): Schema<T> {
  return {
    _check: base._check,
    optional: base.optional,
    _meta: base._meta,
    [Symbol.toSerialize]: base[Symbol.toSerialize],
    meta(metadata: SchemaMeta): Schema<T> {
      const merged = { ...(base._meta ?? {}), ...metadata };
      return defineSchema<T>({
        _check: base._check,
        optional: base.optional,
        _meta: merged,
        [Symbol.toSerialize]: (value, kind) => {
          const out = base[Symbol.toSerialize]?.(value, kind);
          return kind === "json" && out && typeof out === "object"
            ? { ...(out as object), ...jsonMeta(merged) }
            : out;
        },
      });
    },
  };
}

const t = {
  string(): Schema<string> {
    return defineSchema<string>({
      _check(v, p, i) {
        if (typeof v !== "string") {
          i.push({ path: p || ".", message: "expected string" });
        }
        return v as string;
      },
      [Symbol.toSerialize]: (_v, kind) =>
        kind === "json" ? { type: "string" } : {},
    });
  },

  number(): Schema<number> {
    return defineSchema<number>({
      _check(v, p, i) {
        // coerce numeric strings (query/params arrive as text)
        if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
          return Number(v);
        }
        if (typeof v !== "number" || Number.isNaN(v)) {
          i.push({ path: p || ".", message: "expected number" });
        }
        return v as number;
      },
      [Symbol.toSerialize]: (_v, kind) =>
        kind === "json" ? { type: "number" } : {},
    });
  },

  boolean(): Schema<boolean> {
    return defineSchema<boolean>({
      _check(v, p, i) {
        if (v === "true") return true;
        if (v === "false") return false;
        if (typeof v !== "boolean") {
          i.push({ path: p || ".", message: "expected boolean" });
        }
        return v as boolean;
      },
      [Symbol.toSerialize]: (_v, kind) =>
        kind === "json" ? { type: "boolean" } : {},
    });
  },

  literal<L extends string | number | boolean>(lit: L): Schema<L> {
    return defineSchema<L>({
      _check(v, p, i) {
        if (v !== lit) {
          i.push({ path: p || ".", message: `expected ${JSON.stringify(lit)}` });
        }
        return v as L;
      },
      [Symbol.toSerialize]: (_v, kind) => (kind === "json" ? { const: lit } : {}),
    });
  },

  optional<S extends Schema>(inner: S): Schema<Infer<S> | undefined> {
    return defineSchema<Infer<S> | undefined>({
      optional: true,
      _check(v, p, i) {
        if (v === undefined) return undefined;
        return inner._check(v, p, i) as Infer<S>;
      },
      [Symbol.toSerialize]: (_v, kind) => toJsonSchema(inner, kind),
    });
  },

  array<S extends Schema>(inner: S): Schema<Infer<S>[]> {
    return defineSchema<Infer<S>[]>({
      _check(v, p, i) {
        if (!Array.isArray(v)) {
          i.push({ path: p || ".", message: "expected array" });
          return [];
        }
        return v.map((item, idx) => inner._check(item, `${p}[${idx}]`, i)) as Infer<S>[];
      },
      [Symbol.toSerialize]: (_v, kind) =>
        kind === "json"
          ? { type: "array", items: toJsonSchema(inner, kind) }
          : {},
    });
  },

  union<S extends Schema>(...options: S[]): Schema<Infer<S>> {
    return defineSchema<Infer<S>>({
      _check(v, p, i) {
        for (const option of options) {
          const sub: Issue[] = [];
          const r = option._check(v, p, sub);
          if (sub.length === 0) return r as Infer<S>;
        }
        i.push({ path: p || ".", message: "no matching variant" });
        return v as Infer<S>;
      },
      [Symbol.toSerialize]: (_v, kind) =>
        kind === "json"
          ? { anyOf: options.map((o) => toJsonSchema(o, kind)) }
          : {},
    });
  },

  object<P extends Record<string, Schema>>(
    props: P,
  ): Schema<{ [K in keyof P]: Infer<P[K]> }> {
    return defineSchema<{ [K in keyof P]: Infer<P[K]> }>({
      _check(v, p, i) {
        if (typeof v !== "object" || v === null || Array.isArray(v)) {
          i.push({ path: p || ".", message: "expected object" });
          return {} as { [K in keyof P]: Infer<P[K]> };
        }
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(props)) {
          const schema = props[key];
          const value = (v as Record<string, unknown>)[key];
          if (value === undefined && schema.optional) continue;
          out[key] = schema._check(value, p ? `${p}.${key}` : key, i);
        }
        return out as { [K in keyof P]: Infer<P[K]> };
      },
      [Symbol.toSerialize]: (_v, kind) => {
        if (kind !== "json") return {};
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];
        for (const key of Object.keys(props)) {
          properties[key] = toJsonSchema(props[key], kind);
          if (!props[key].optional) required.push(key);
        }
        return required.length
          ? { type: "object", properties, required }
          : { type: "object", properties };
      },
    });
  },

  any(): Schema {
    return defineSchema({ _check: (v) => v, [Symbol.toSerialize]: () => ({}) });
  },
};

// ============================================================
// Route validation schema (input + per-status output)
// ============================================================

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

// ── Type-level request inference (Elysia / tRPC-style autocompletion) ──
// When a route's schema is passed in the same generic call as the handler,
// TypeScript infers the schema type and feeds it back into the handler's
// `request`, so `request.query.<field>` autocompletes with the right type.

type FieldType<Sch, K extends keyof RouteSchema, Fallback> = Sch extends {
  [P in K]: infer V;
}
  ? V extends Schema
    ? Infer<V>
    : Fallback
  : Fallback;

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

// Thrown by `ctx.meta.done()` during the documentation pass to unwind the
// annotator (its real I/O must not run); caught + ignored by `#collectMeta`.
const DESCRIBE_DONE: unique symbol = Symbol("describe.done");

// Build the per-context meta object: a plain bag plus a non-enumerable `done()`
// (non-enumerable so it never leaks into JSON output / the OpenAPI `x-guards`).
function makeMeta(ctx: { describing?: boolean }): ContextMeta {
  const meta = {} as ContextMeta;
  Object.defineProperty(meta, "done", {
    value() {
      if (ctx.describing) throw DESCRIBE_DONE;
    },
    enumerable: false,
  });
  return meta;
}

// Async context tracking: the current request's Context is available anywhere
// in the async call tree (logging, db, tracing) without threading it through.
const requestContext = new AsyncLocalStorage<Context>();

/** Ambient access to the in-flight request context (survives `await`). */
function context(): Context | undefined {
  return requestContext.getStore();
}

/** Request-scoped log line — picks up the requestId from async context. */
function trace(message: string): void {
  console.log(`[${context()?.requestId ?? "-"}] ${message}`);
}

// ============================================================
// Cookies — typed read (Cookie) / write (Set-Cookie)
// ============================================================

interface CookieOptions {
  maxAge?: number; // seconds
  expires?: Date;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return out;
}

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  let s = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.expires) s += `; Expires=${opts.expires.toUTCString()}`;
  if (opts.domain) s += `; Domain=${opts.domain}`;
  s += `; Path=${opts.path ?? "/"}`;
  if (opts.secure) s += "; Secure";
  if (opts.httpOnly) s += "; HttpOnly";
  if (opts.sameSite) s += `; SameSite=${opts.sameSite}`;
  return s;
}

function appendSetCookie(res: HttpResponse, cookie: string): void {
  const prev = res.getHeader("Set-Cookie");
  if (prev === undefined) res.setHeader("Set-Cookie", cookie);
  else res.setHeader("Set-Cookie", Array.isArray(prev) ? [...prev, cookie] : [String(prev), cookie]);
}

/** Lazy cookie jar: parses `Cookie` on first read, writes `Set-Cookie` on set. */
class CookieJar {
  #req: HttpRequest;
  #res: HttpResponse;
  #parsed?: Record<string, string>;

  constructor(req: HttpRequest, res: HttpResponse) {
    this.#req = req;
    this.#res = res;
  }

  get(name: string): string | undefined {
    return (this.#parsed ??= parseCookies(this.#req.headers.cookie))[name];
  }

  all(): Record<string, string> {
    return { ...(this.#parsed ??= parseCookies(this.#req.headers.cookie)) };
  }

  set(name: string, value: string, opts?: CookieOptions): void {
    appendSetCookie(this.#res, serializeCookie(name, value, opts));
  }

  /** Expire a cookie now (same path/domain it was set with). */
  delete(name: string, opts?: Pick<CookieOptions, "path" | "domain">): void {
    appendSetCookie(this.#res, serializeCookie(name, "", { ...opts, maxAge: 0, expires: new Date(0) }));
  }
}

// ============================================================
// Middleware — onion model, return-based (composes with handlers)
// ------------------------------------------------------------
// A middleware wraps the request: call `next()` to run downstream and get its
// result, optionally transform it, or return your own value to short-circuit
// (no `next()` → handler never runs). Because the framework serializes the
// RETURNED value after the whole chain unwinds, a middleware can still set
// response headers/cookies *after* `await next()` (before the bytes go out).
// ============================================================

type Next = () => Promise<unknown>;
type Middleware = (ctx: Context, next: Next) => MaybePromise<unknown>;

/** Build and run the onion chain: mws[0] is outermost, `inner` is the core. */
function runMiddleware(
  mws: readonly Middleware[],
  ctx: Context,
  inner: () => Promise<unknown>,
): Promise<unknown> {
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
class HttpContext implements Context {
  state: Record<string, unknown> = {};
  describing?: boolean;
  #meta?: ContextMeta;
  #cookies?: CookieJar;

  // Lazy (like `cookies`): the hot path pays nothing until `meta` is touched —
  // only guards/interceptors that self-describe (or the doc harvest) build it.
  get meta(): ContextMeta {
    return (this.#meta ??= makeMeta(this));
  }
  // Reassigning `ctx.meta = {…}` merges the new fields onto the persistent meta
  // object, preserving its (non-enumerable) `done()`.
  set meta(value: ContextMetaInit) {
    const m = (this.#meta ??= makeMeta(this));
    for (const k of Object.keys(m)) delete m[k];
    Object.assign(m, value);
  }
  /** Internal: compiled serializer chosen by #resolve, read by #dispatch's send. */
  _serializer?: (v: unknown) => string;

  constructor(
    public request: HttpRequest,
    public response: HttpResponse,
    public params: Record<string, string>,
    public query: Record<string, string>,
    public body: unknown,
    public requestId: string,
  ) {}

  get cookies(): CookieJar {
    return (this.#cookies ??= new CookieJar(this.request, this.response));
  }
}

interface StubInit {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /** Mark the context as a documentation probe (annotators short-circuit on it). */
  describing?: boolean;
}

// A throwaway, socket-less context for OFF-REQUEST execution — harvesting OpenAPI
// `meta` (`describing: true`) or trying a route's guards against synthetic input
// (`tryGuards`). Not a live request: the response is a no-op header sink.
function stubContext(method: string, path: string, init: StubInit = {}): HttpContext {
  const request = {
    method,
    url: path,
    headers: init.headers ?? {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as HttpRequest;
  const response = {
    setHeader() {},
    getHeader() {
      return undefined;
    },
    hasHeader() {
      return false;
    },
    removeHeader() {},
    getHeaderNames() {
      return [];
    },
    headersSent: false,
    writableEnded: false,
  } as unknown as HttpResponse;
  const ctx = new HttpContext(request, response, init.params ?? EMPTY_BAG, init.query ?? EMPTY_BAG, init.body, "stub");
  if (init.describing) ctx.describing = true;
  return ctx;
}

function describeContext(method: string, path: string): HttpContext {
  return stubContext(method, path, { describing: true });
}

/** A guard's documentation name: its `doc.name` (set by {@link withDocumentation}),
 *  else its function name, else `"guard"`. */
function guardDocName(g: Guard): string {
  const d = (g as { doc?: ContextMetaInit | string }).doc;
  return (typeof d === "object" ? d?.name : d) || g.name || "guard";
}

/** The verdict of running one guard during {@link AppBuilder.tryGuards}. */
interface GuardTrial {
  name: string;
  outcome: "passed" | "denied" | "error" | "skipped";
  status?: number;
  message?: string;
}

function hasOwnKeys(o: object): boolean {
  for (const _ in o) return true;
  return false;
}

// ============================================================
// Response cache (createCache)
// ------------------------------------------------------------
// Stays in core: it's bound to the serialization/send engine (compiles a result
// to bytes via the real send() path, replays them on a hit). Every OTHER
// middleware lives in its own `@youneed/server-middleware-*` package.
// ============================================================

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

// A cached body that owns a stream can't be replayed — skip those.
function isCacheable(result: unknown): boolean {
  if (isResult(result)) {
    if ((result as HttpResult)[OWNS_STREAM]) return false; // File(): re-openable stream, don't read body
    const body = (result as HttpResult).body;
    return !(body instanceof Readable);
  }
  return !(result instanceof Readable);
}

interface CompiledResponse {
  status: number;
  headers: OutgoingHttpHeaders;
  body: Buffer;
}

// A headless ServerResponse stand-in: `send` writes into it, we keep the bytes.
// Lets us serialize a result to a buffer with the real send() path, no socket.
class BufferingResponse {
  statusCode = 200;
  writableEnded = false;
  headersSent = false;
  #headers: Record<string, string | number | string[]> = {};
  #chunks: Buffer[] = [];
  #buf(c: unknown, enc?: unknown): Buffer {
    return Buffer.isBuffer(c) ? c : Buffer.from(c as string, typeof enc === "string" ? (enc as BufferEncoding) : "utf8");
  }
  setHeader(k: string, v: string | number | string[]) { this.#headers[k.toLowerCase()] = v; }
  getHeader(k: string) { return this.#headers[k.toLowerCase()]; }
  hasHeader(k: string) { return k.toLowerCase() in this.#headers; }
  removeHeader(k: string) { delete this.#headers[k.toLowerCase()]; }
  getHeaders() { return { ...this.#headers }; }
  writeHead(status: number, headers?: OutgoingHttpHeaders) {
    this.statusCode = status;
    if (headers) for (const k in headers) this.setHeader(k, headers[k] as string);
    this.headersSent = true;
    return this;
  }
  write(c: unknown, enc?: unknown) { if (c) this.#chunks.push(this.#buf(c, enc)); return true; }
  end(c?: unknown, enc?: unknown) {
    if (c && typeof c !== "function") this.#chunks.push(this.#buf(c, enc));
    this.writableEnded = true;
    this.headersSent = true;
  }
  compiled(): CompiledResponse {
    return {
      status: this.statusCode,
      headers: this.getHeaders(),
      body: this.#chunks.length === 1 ? this.#chunks[0] : Buffer.concat(this.#chunks),
    };
  }
}

/** Serialize a result to bytes through the real send() path (no live socket). */
async function compileResult(
  result: unknown,
  kind: SerializeKind,
  serializer?: (v: unknown) => string,
): Promise<CompiledResponse> {
  const fake = new BufferingResponse();
  const pending = send(fake as unknown as HttpResponse, result, kind, serializer);
  if (pending) await pending;
  return fake.compiled();
}

/** Write a precompiled response to a live socket (no serialization). */
function replayCompiled(res: HttpResponse, c: CompiledResponse, tag: string): void {
  res.statusCode = c.status;
  const h = c.headers;
  for (const k in h) {
    const v = h[k];
    if (v !== undefined) res.setHeader(k, v as string | number | string[]);
  }
  res.setHeader("x-cache", tag);
  res.end(c.body);
}

interface CacheEntry {
  result: unknown;
  compiled?: CompiledResponse;
  expires: number; // fresh until
  staleUntil: number; // serveable (stale) until
}

/** In-memory response cache: TTL, LRU-ish cap, coalescing, stale-while-revalidate,
 * optional response compilation, and flexible invalidation. */
function createCache(opts: CacheOptions = {}): Cache {
  const ttl = opts.ttl ?? 30_000;
  const max = opts.max ?? 1000;
  const swr = opts.staleWhileRevalidate ?? 0;
  const compile = opts.compile === true;
  const coalesce = opts.coalesce !== false;
  const keyOf = opts.key ?? ((ctx) => `${ctx.request.method} ${ctx.request.url}`);
  const store = new Map<string, CacheEntry>();
  const flights = new Map<string, Promise<unknown>>(); // single-flight
  const revalidating = new Set<string>(); // background SWR refreshes in progress

  const touch = (key: string, entry: CacheEntry) => {
    store.delete(key); // re-insert → most-recently-used (Map keeps insertion order)
    store.set(key, entry);
  };
  const setEntry = (key: string, entry: CacheEntry) => {
    store.set(key, entry);
    if (store.size > max) store.delete(store.keys().next().value as string);
  };
  // Serve a cached entry: replay bytes when compiled, else hand back the value.
  const serve = (ctx: Context, entry: CacheEntry, tag: string): unknown => {
    if (compile && entry.compiled) {
      replayCompiled(ctx.response, entry.compiled, tag);
      return undefined; // already written → outer send is skipped
    }
    ctx.response.setHeader("x-cache", tag);
    return entry.result;
  };
  // Persist a freshly computed result (+ compiled bytes when enabled).
  const persist = async (key: string, ctx: Context, result: unknown) => {
    const expires = Date.now() + ttl;
    const entry: CacheEntry = { result, expires, staleUntil: expires + swr };
    if (compile) {
      const kind = negotiate(ctx.request.headers.accept);
      entry.compiled = await compileResult(result, kind, (ctx as { _serializer?: (v: unknown) => string })._serializer);
    }
    setEntry(key, entry);
    return entry;
  };
  // Refresh a stale entry once, in the background, off the request's critical path.
  const scheduleRevalidate = (key: string, ctx: Context, next: Next) => {
    if (revalidating.has(key)) return;
    revalidating.add(key);
    // setTimeout (not microtask) so the current request fully completes — and
    // outer middleware stop reading ctx.response — before we borrow it.
    setTimeout(async () => {
      const realRes = ctx.response;
      (ctx as { response: HttpResponse }).response = new BufferingResponse() as unknown as HttpResponse;
      try {
        const result = await next();
        if (isCacheable(result)) await persist(key, ctx, result);
      } catch {
        // keep serving the existing (stale) entry on failure
      } finally {
        (ctx as { response: HttpResponse }).response = realRes;
        revalidating.delete(key);
      }
    }, 0);
  };

  return {
    middleware(): Middleware {
      return async (ctx, next) => {
        const req = ctx.request;
        const res = ctx.response;
        // Cache the safe, idempotent methods: GET, plus QUERY (RFC 9110-style).
        // A QUERY's response depends on its request body, so the key folds in a
        // hash of the body — and `collectRaw` memoizes it, so the handler's
        // later `readBody` reuses the same bytes (no double-drain of the stream).
        if (req.method !== "GET" && req.method !== "QUERY") return next();
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
        if (coalesce) flights.set(key, flight);
        let result: unknown;
        try {
          result = await flight;
        } finally {
          if (coalesce) flights.delete(key);
        }

        // Handler streamed/wrote the response itself, or it's uncacheable.
        if (res.headersSent || res.writableEnded || !isCacheable(result)) {
          if (!res.headersSent) res.setHeader("x-cache", "MISS");
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
    invalidate(target): number {
      if (typeof target === "string") return store.delete(target) ? 1 : 0;
      const match =
        target instanceof RegExp ? (k: string) => target.test(k) : target;
      let n = 0;
      for (const k of [...store.keys()]) if (match(k)) n += store.delete(k) ? 1 : 0;
      return n;
    },
    clear(): void {
      store.clear();
    },
    get size(): number {
      return store.size;
    },
    get inflight(): number {
      return flights.size;
    },
  };
}

// ── Distributed response cache (createDistributedCache) ────────────────────────
//
// `createCache` above is in-process (a `Map`) and its `Cache` interface is
// synchronous. A SHARED cache across instances needs an async backend, so it gets
// its own async-returning interface here. It stores only the *compiled bytes* of
// a response (the sole serializable form), so a hit on ANY node replays the
// precomputed buffer — skipping the handler AND serialization.

/** Minimal async key-value backend the distributed cache needs. `@youneed/kv`'s
 *  `KV` (MemoryKV / RedisKV) satisfies this structurally — so core stays dep-free
 *  and any compatible store plugs in. */
interface CacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, opts?: { ttl?: number }): Promise<void>;
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

// Wire form of a cached response: status, headers, base64 body, fresh-until (ms).
interface StoredResponse {
  s: number;
  h: OutgoingHttpHeaders;
  b: string;
  e: number;
}

/** Shared response cache backed by a distributed `CacheStore` (see `@youneed/kv`).
 *  Freshness + the stale window are carried in the stored payload; LRU/eviction is
 *  delegated to the backend (e.g. Redis `maxmemory`) plus the per-key TTL.
 *  Coalescing and background revalidation are per-node. */
function createDistributedCache(opts: DistributedCacheOptions): DistributedCache {
  const store = opts.store;
  const ttl = opts.ttl ?? 30_000;
  const swr = opts.staleWhileRevalidate ?? 0;
  const coalesce = opts.coalesce !== false;
  const prefix = opts.prefix ?? "cache:";
  const keyOf = opts.key ?? ((ctx) => `${ctx.request.method} ${ctx.request.url}`);
  const flights = new Map<string, Promise<unknown>>(); // per-node single-flight
  const revalidating = new Set<string>(); // per-node background SWR refreshes
  // The store's own TTL (seconds) must outlast the whole fresh + stale window.
  const storeTtlSec = Math.max(1, Math.ceil((ttl + swr) / 1000));

  const decode = (raw: string): StoredResponse | undefined => {
    try {
      return JSON.parse(raw) as StoredResponse;
    } catch {
      return undefined; // corrupt payload → treat as a miss
    }
  };
  const replay = (ctx: Context, e: StoredResponse, tag: string): undefined => {
    replayCompiled(ctx.response, { status: e.s, headers: e.h, body: Buffer.from(e.b, "base64") }, tag);
    return undefined; // already written → outer send is skipped
  };
  const persist = async (key: string, ctx: Context, result: unknown): Promise<StoredResponse | undefined> => {
    if (!isCacheable(result)) return undefined;
    const kind = negotiate(ctx.request.headers.accept);
    const compiled = await compileResult(result, kind, (ctx as { _serializer?: (v: unknown) => string })._serializer);
    const entry: StoredResponse = { s: compiled.status, h: compiled.headers, b: compiled.body.toString("base64"), e: Date.now() + ttl };
    await store.set(prefix + key, JSON.stringify(entry), { ttl: storeTtlSec });
    return entry;
  };
  const scheduleRevalidate = (key: string, ctx: Context, next: Next) => {
    if (revalidating.has(key)) return;
    revalidating.add(key);
    // setTimeout (not microtask) so the current request fully completes — and outer
    // middleware stop reading ctx.response — before we borrow it for the refresh.
    setTimeout(async () => {
      const realRes = ctx.response;
      (ctx as { response: HttpResponse }).response = new BufferingResponse() as unknown as HttpResponse;
      try {
        await persist(key, ctx, await next());
      } catch {
        // keep serving the existing (stale) entry on failure
      } finally {
        (ctx as { response: HttpResponse }).response = realRes;
        revalidating.delete(key);
      }
    }, 0);
  };

  return {
    middleware(): Middleware {
      return async (ctx, next) => {
        const req = ctx.request;
        const res = ctx.response;
        if (req.method !== "GET" && req.method !== "QUERY") return next();
        let key = keyOf(ctx);
        if (req.method === "QUERY") {
          const raw = await collectRaw(req);
          key += " " + createHash("sha1").update(raw).digest("base64url");
        }
        const now = Date.now();

        const raw = await store.get(prefix + key);
        const entry = raw ? decode(raw) : undefined;
        if (entry) {
          if (entry.e > now) return replay(ctx, entry, "HIT");
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
        if (coalesce) flights.set(key, flight);
        let result: unknown;
        try {
          result = await flight;
        } finally {
          if (coalesce) flights.delete(key);
        }

        // Handler streamed/wrote the response itself, or it's uncacheable.
        if (res.headersSent || res.writableEnded || !isCacheable(result)) {
          if (!res.headersSent) res.setHeader("x-cache", "MISS");
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
    async invalidate(target): Promise<number> {
      if (typeof target === "string") {
        await store.delete(prefix + target);
        return 1;
      }
      if (!store.scan) throw new Error("invalidate(RegExp|predicate) requires a store with scan()");
      const match = target instanceof RegExp ? (k: string) => target.test(k) : target;
      let n = 0;
      for (const full of await store.scan(prefix)) {
        if (match(full.slice(prefix.length))) {
          await store.delete(full);
          n++;
        }
      }
      return n;
    },
    async clear(): Promise<void> {
      if (!store.scan) throw new Error("clear() requires a store with scan()");
      for (const full of await store.scan(prefix)) await store.delete(full);
    },
    async size(): Promise<number> {
      if (!store.scan) throw new Error("size() requires a store with scan()");
      return (await store.scan(prefix)).length;
    },
    get inflight(): number {
      return flights.size;
    },
  };
}

// Append a token to the `Vary` header without duplicating it. Exported as `vary`
// for the cors/compression middleware packages.
function appendVary(res: HttpResponse, value: string): string {
  const prev = res.getHeader("Vary");
  if (!prev) return value;
  const list = String(prev);
  return list.split(",").map((s) => s.trim().toLowerCase()).includes(value.toLowerCase())
    ? list
    : `${list}, ${value}`;
}

type TypedHandler<Sch extends RouteSchema> = (
  ctx: Context<Sch>,
) => MaybePromise<unknown>;

/**
 * A guard runs before the handler, inside the request's async context (so it
 * can use `trace`/`context` and the already-validated `ctx`). Return `false`
 * to reject with 403, throw an `HttpError` for any other status, or return
 * `true`/`undefined` to let the request through.
 */
type Guard = (ctx: Context) => MaybePromise<boolean | void>;

// Any guard / interceptor / middleware — it takes the context first.
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
function withDocumentation<F extends Annotator>(fn: F, doc?: ContextMetaInit): F {
  if (!doc) return fn;
  const wrapped = (ctx: Context, ...rest: unknown[]): unknown => {
    ctx.meta = { ...doc };
    ctx.meta.done(); // documenting → halts here; real request → no-op, continue
    return (fn as Annotator)(ctx, ...rest);
  };
  // Also stamp the doc statically, so STATIC introspection (`app.topology()` →
  // `@youneed/server-plugin-devtools`) can read it without the harvest pass.
  (wrapped as { doc?: ContextMetaInit }).doc = doc;
  return wrapped as F;
}

/** {@link withDocumentation} typed for a {@link Guard}. */
function guardWithDocumentation(guard: Guard, doc?: ContextMetaInit): Guard {
  return withDocumentation(guard, doc);
}

function responseSchemaFor(
  response: RouteSchema["response"],
  status: number,
): Schema | undefined {
  if (!response) return undefined;
  if (isSchema(response)) return status === 200 ? response : undefined;
  return response[status];
}

// ============================================================
// Protocol-agnostic route registry (for decorator controllers)
// ------------------------------------------------------------
// Decorators only record *what* a method handles, never *how* it is
// served. Today the HTTP transport consumes these, but a future WS or
// CLI transport will read the very same registry, filtering by `protocol`.
// ============================================================

type Protocol = "http" | "ws" | "cli";

interface RouteMeta {
  protocol: Protocol;
  /** http: HTTP method · ws: event name · cli: command name */
  trigger: string;
  /** sub-path relative to the controller base */
  path: string;
  handlerName: string;
  schema?: RouteSchema;
}

const routeRegistry = createRegistry<Map<string, RouteMeta>>(() => new Map());

function registerRoute(ctor: Function, meta: RouteMeta) {
  routeRegistry.for(ctor).set(`${meta.protocol}:${meta.trigger}:${meta.handlerName}`, meta);
}

function getRoutes(ctor: Function): RouteMeta[] {
  return [...(routeRegistry.read(ctor)?.values() ?? [])];
}

// Method-level guards live in a parallel registry, keyed by handler name, and
// are merged with the controller's class-level guards at mount time.
const guardRegistry = createRegistry<Map<string, Guard[]>>(() => new Map());

function registerGuards(ctor: Function, handlerName: string, guards: Guard[]) {
  const map = guardRegistry.for(ctor);
  map.set(handlerName, [...(map.get(handlerName) ?? []), ...guards]);
}

function getGuards(ctor: Function, handlerName: string): Guard[] {
  return guardRegistry.read(ctor)?.get(handlerName) ?? [];
}

/**
 * An interceptor wraps a handler: it runs code BEFORE and AFTER, can short-circuit
 * (skip the handler) and — unlike a {@link Guard}, which is a pre-check that only
 * allows/denies — can transform the RESULT as the chain unwinds (envelope, timing,
 * caching, mapping). It's exactly a {@link Middleware}, but attached per-controller
 * / per-handler by decorator instead of by URL prefix.
 */
type Interceptor = Middleware;

// Method-level interceptors, same shape as the guard registry.
const interceptorRegistry = createRegistry<Map<string, Interceptor[]>>(() => new Map());

function registerInterceptors(ctor: Function, handlerName: string, interceptors: Interceptor[]) {
  const map = interceptorRegistry.for(ctor);
  map.set(handlerName, [...(map.get(handlerName) ?? []), ...interceptors]);
}

function getInterceptors(ctor: Function, handlerName: string): Interceptor[] {
  return interceptorRegistry.read(ctor)?.get(handlerName) ?? [];
}

// Method-level middleware, same shape as the guard registry. Controller
// middleware runs OUTSIDE guards (Express-style), unlike interceptors.
const ctrlMiddlewareRegistry = createRegistry<Map<string, Middleware[]>>(() => new Map());

function registerMiddlewares(ctor: Function, handlerName: string, mws: Middleware[]) {
  const map = ctrlMiddlewareRegistry.for(ctor);
  map.set(handlerName, [...(map.get(handlerName) ?? []), ...mws]);
}

function getMiddlewares(ctor: Function, handlerName: string): Middleware[] {
  return ctrlMiddlewareRegistry.read(ctor)?.get(handlerName) ?? [];
}

// ============================================================
// Method decorators
// ============================================================

function httpMethod(trigger: string) {
  // Usage: @Controller.post("/path", { body, response }) or @Controller.post({ body })
  return function (
    pathOrSchema?: string | RouteSchema,
    maybeSchema?: RouteSchema,
  ) {
    const path = typeof pathOrSchema === "string" ? pathOrSchema : "";
    const schema = typeof pathOrSchema === "string" ? maybeSchema : pathOrSchema;
    return function (_target: HttpHandler, ctx: ClassMethodDecoratorContext) {
      ctx.addInitializer(function (this: unknown) {
        registerRoute(ctorOf(this), {
          protocol: "http",
          trigger,
          path,
          handlerName: ctx.name as string,
          schema,
        });
      });
    };
  };
}

// @Controller.guard(auth, isAdmin) — attaches guards to a single handler.
// Stacks with the controller's class-level guards (those run first).
function guard(...guards: Guard[]) {
  return function (_target: HttpHandler, ctx: ClassMethodDecoratorContext) {
    ctx.addInitializer(function (this: unknown) {
      registerGuards(ctorOf(this), ctx.name as string, guards);
    });
  };
}

// @Controller.intercept(timing, envelope) — wraps a single handler. Stacks with
// the controller's class-level interceptors (those run outermost).
function intercept(...interceptors: Interceptor[]) {
  return function (_target: HttpHandler, ctx: ClassMethodDecoratorContext) {
    ctx.addInitializer(function (this: unknown) {
      registerInterceptors(ctorOf(this), ctx.name as string, interceptors);
    });
  };
}

// @Controller.middleware(logger, cors) — attaches middleware to a single handler.
// Runs OUTSIDE the controller's guards/interceptors (Express-style), stacking
// after the controller's class-level middleware.
function middleware(...mws: Middleware[]) {
  return function (_target: HttpHandler, ctx: ClassMethodDecoratorContext) {
    ctx.addInitializer(function (this: unknown) {
      registerMiddlewares(ctorOf(this), ctx.name as string, mws);
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

// ============================================================
// Controller base + factory
// ============================================================

/** Minimal structural logger (so core needn't depend on `@youneed/logger`; its
 *  `Logger` satisfies this). What `Controller.prototype.log` returns. */
interface RequestLogger {
  error(message: unknown, meta?: Record<string, unknown>): unknown;
  warn(message: unknown, meta?: Record<string, unknown>): unknown;
  info(message: unknown, meta?: Record<string, unknown>): unknown;
  debug(message: unknown, meta?: Record<string, unknown>): unknown;
  [key: string]: unknown;
}

// Fallback when no logger middleware ran — so `this.log` never throws.
const CONSOLE_LOGGER: RequestLogger = {
  error: (m, meta) => console.error(m, meta ?? ""),
  warn: (m, meta) => console.warn(m, meta ?? ""),
  info: (m, meta) => console.info(m, meta ?? ""),
  debug: (m, meta) => console.debug(m, meta ?? ""),
};

class ControllerInternal {
  /** Base path shared by every route of the controller. */
  static basePath = "";

  /** Guards applied to every route of the controller (run before per-method ones). */
  static guards: Guard[] = [];

  /** Interceptors wrapping every route of the controller (outermost; before the
   *  per-method ones, which wrap the handler more closely). */
  static interceptors: Interceptor[] = [];

  /** Middleware applied to every route of the controller. Runs OUTSIDE guards
   *  (Express-style), before the per-method `@Controller.middleware` ones. */
  static middlewares: Middleware[] = [];

  /** Providers installed once on the controller instance at mount — they add
   *  PRIVATE members under a namespace (e.g. `this.orm`). Unlike guards/middleware
   *  (which only gate/transform a request), a provider extends the instance. */
  static providers: ControllerProvider[] = [];

  /**
   * Descriptor factory, callable + `.json` / `.text` shortcuts:
   *   this.Response({ status, headers, body })
   *   this.Response.json(value, { status })
   *   this.Response.text(str, { status })
   */
  Response = Response;

  /** The in-flight request context (via async-local storage); `undefined` outside
   *  a request. Lets a controller method read `this.ctx` instead of taking `ctx`. */
  get ctx(): Context | undefined {
    return context();
  }

  /** The request-scoped logger set by `@youneed/server-middleware-logger`
   *  (`ctx.state.logger`), so a controller method can `this.log.info(...)` and the
   *  line carries requestId/traceId. Falls back to `console` when not installed. */
  get log(): RequestLogger {
    const state = context()?.state as Record<string, unknown> | undefined;
    const key = (state?.__loggerKey as string | undefined) ?? "logger";
    return (state?.[key] as RequestLogger | undefined) ?? CONSOLE_LOGGER;
  }

  static decorators = decorators;
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

// Fold a list of provider contributions into a single intersection.
type ContribOf<P> = P extends ControllerProvider<infer C> ? C : {};
type ProviderContributions<P extends readonly ControllerProvider[]> = P extends readonly []
  ? {}
  : P extends readonly [infer H, ...infer T extends readonly ControllerProvider[]]
    ? ContribOf<H> & ProviderContributions<T>
    : {};

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

function Controller<const TProviders extends readonly ControllerProvider[] = readonly []>(
  basePathOrConfig: string | ControllerConfig<TProviders> = "",
  opts?: {
    guards?: Guard[];
    interceptors?: Interceptor[];
    middlewares?: Middleware[];
    providers?: TProviders;
  },
) {
  const cfg: ControllerConfig<TProviders> =
    typeof basePathOrConfig === "string" ? { url: basePathOrConfig, ...opts } : basePathOrConfig;
  class ScopedController extends ControllerInternal {
    static override basePath = cfg.url ?? cfg.basePath ?? "";
    static override guards = cfg.guards ?? [];
    static override interceptors = cfg.interceptors ?? [];
    static override middlewares = cfg.middlewares ?? [];
    static override providers = (cfg.providers ?? []) as unknown as ControllerProvider[];
  }
  // `typeof ScopedController` is preserved verbatim (statics + `() => ScopedController`).
  // The extra abstract construct signature folds each provider's contribution into
  // the INSTANCE type, so `extends Controller(path, { providers })` gives a typed
  // `this.<member>` (e.g. `this.orm`). No providers ⇒ contribution `{}` (a no-op).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ScopedController as typeof ScopedController &
    (abstract new (...args: any[]) => ProviderContributions<TProviders>);
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

interface WebSocketLike {
  send(data: string | Buffer): void;
  close(code?: number): void;
  readonly readyState: number;
}

interface WsHandlers {
  open?: (ws: WebSocketLike) => void;
  message?: (
    ws: WebSocketLike,
    message: string,
  ) => MaybePromise<unknown> | AsyncIterable<unknown>;
  close?: (ws: WebSocketLike) => void;
  /** Payload schemas — incoming (`message`) and outgoing (`response`). */
  schema?: { message?: Schema; response?: Schema };
}

/** Minimal RFC 6455 connection — text/binary frames, ping/pong, close. */
class WsConnection extends EventEmitter implements WebSocketLike {
  #socket: Duplex;
  #buf = Buffer.alloc(0);
  readyState = 1; // OPEN

  constructor(socket: Duplex) {
    super();
    this.#socket = socket;
    socket.on("data", (chunk: Buffer) => this.#onData(chunk));
    socket.on("close", () => {
      this.readyState = 3;
      this.emit("close");
    });
    socket.on("error", () => {
      this.readyState = 3;
    });
  }

  #onData(chunk: Buffer) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    let frame;
    while ((frame = this.#parse())) {
      const { opcode, payload } = frame;
      if (opcode === 0x8) return this.close(); // close
      if (opcode === 0x9) this.#frame(0xa, payload); // ping -> pong
      else if (opcode === 0x1) this.emit("message", payload.toString("utf8"));
      else if (opcode === 0x2) this.emit("message", payload);
    }
  }

  #parse(): { opcode: number; payload: Buffer } | null {
    const buf = this.#buf;
    if (buf.length < 2) return null;

    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;

    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }

    let maskKey: Buffer | null = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + len) return null;

    let payload = buf.subarray(offset, offset + len);
    if (maskKey) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
    }

    this.#buf = buf.subarray(offset + len);
    return { opcode, payload };
  }

  #frame(opcode: number, payload: Buffer) {
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.#socket.write(Buffer.concat([header, payload]));
  }

  send(data: string | Buffer) {
    if (this.readyState !== 1) return;
    const isText = typeof data === "string";
    this.#frame(isText ? 0x1 : 0x2, isText ? Buffer.from(data, "utf8") : data);
  }

  close(code = 1000) {
    if (this.readyState === 3) return;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    this.#frame(0x8, payload);
    this.readyState = 3;
    this.#socket.end();
  }
}

// ============================================================
// Server-Sent Events support
// ------------------------------------------------------------
// SSE is a one-directional HTTP stream (text/event-stream). Modeled like
// `.ws`: an `{ open?, close?, schema? }` handler object where `open` may be a
// plain function (push via `conn.send`) or an async generator (yielded events
// are streamed, then the stream closes) — mirroring ws `message`.
// ============================================================

interface SseEvent {
  data: unknown; // string sent as-is, otherwise JSON.stringify'd
  event?: string;
  id?: string;
  retry?: number;
}

interface SseHandlers {
  open?: (
    conn: SseConnection,
  ) => MaybePromise<unknown> | AsyncIterable<SseEvent | string>;
  close?: (conn: SseConnection) => void;
  /** Payload schema for the emitted events (for AsyncAPI). */
  schema?: { event?: Schema };
}

class SseConnection {
  #res: HttpResponse;
  #closed = false;

  constructor(res: HttpResponse) {
    this.#res = res;
    res.on("close", () => (this.#closed = true));
  }

  get closed() {
    return this.#closed;
  }

  send(event: SseEvent | string) {
    if (this.#closed) return;
    const e: SseEvent = typeof event === "string" ? { data: event } : event;
    let frame = "";
    if (e.event) frame += `event: ${e.event}\n`;
    if (e.id) frame += `id: ${e.id}\n`;
    if (e.retry) frame += `retry: ${e.retry}\n`;
    const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    for (const line of data.split("\n")) frame += `data: ${line}\n`;
    this.#res.write(frame + "\n");
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#res.end();
  }
}

async function startSse(
  req: HttpRequest,
  res: HttpResponse,
  handlers: SseHandlers,
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const conn = new SseConnection(res);
  req.on("close", () => handlers.close?.(conn));

  const out = handlers.open?.(conn);
  if (isStreamable(out)) {
    for await (const event of out as AsyncIterable<SseEvent | string>) {
      if (conn.closed) break;
      if (event == null) continue; // tolerate stray `yield` (e.g. a bare await)
      conn.send(event);
    }
    conn.close();
  } else {
    await out;
  }
}

interface SseRouteDef {
  path: string;
  handlers: SseHandlers;
}

// ============================================================
// HTTP transport
// ============================================================

// Anything that owns a `[Symbol.dispose]` or `[Symbol.asyncDispose]`.
type Disposable = {
  [Symbol.dispose]?: () => void;
  [Symbol.asyncDispose]?: () => unknown;
};

/**
 * Release a set of resources in reverse (LIFO) order — last mounted, first torn
 * down. An async disposer is awaited; a sync one runs as-is. Objects without
 * either method are skipped, so implementing disposal is always optional.
 */
async function disposeAll(items: readonly object[]): Promise<void> {
  for (let i = items.length - 1; i >= 0; i--) {
    const d = items[i] as Disposable;
    if (typeof d[Symbol.asyncDispose] === "function") await d[Symbol.asyncDispose]!();
    else if (typeof d[Symbol.dispose] === "function") d[Symbol.dispose]!();
  }
}

// ── Transport / protocol selection ───────────────────────────────────────────
// The same (req, res) handler serves HTTP/1.1 and HTTP/2: node:http2's
// compatibility API hands route handlers Http2ServerRequest/Response that mirror
// IncomingMessage/ServerResponse, so #dispatch is unchanged. We only pick which
// kind of server to construct.

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

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/** Construct the server for the requested protocol. */
function createListenServer(opts: ListenOptions, handler: RequestHandler): ListenServer {
  if (opts.http3) {
    throw new Error(
      "HTTP/3 has no stable server API in this runtime (no node:quic / node:http3). " +
        "Terminate HTTP/3 at a proxy (Caddy, nginx-quic, Cloudflare) and forward to " +
        "this server over HTTP/2 — use { http2: true, key, cert } here.",
    );
  }
  if (opts.http2) {
    if (opts.http2 === "h2c") {
      // Cleartext h2 — compat API still gives us (req, res).
      return createHttp2Cleartext(handler as never);
    }
    if (!opts.key || !opts.cert) {
      throw new Error("http2: true needs TLS `key` and `cert` (or use http2: 'h2c' for cleartext).");
    }
    return createHttp2Secure(
      { key: opts.key, cert: opts.cert, allowHTTP1: opts.allowHTTP1 !== false },
      handler as never,
    );
  }
  return new Server(handler);
}

/** WebSocket upgrade rides the HTTP/1.1 connection — available unless we're on
 *  pure (no-fallback) h2, where there's no `upgrade` event. */
function supportsWsUpgrade(opts: ListenOptions): boolean {
  if (opts.http2 === "h2c") return false; // pure cleartext h2, no http/1.1
  if (opts.http2 === true && opts.allowHTTP1 === false) return false;
  return true;
}

class HTTP {
  #port?: number;
  // Disposing the server also disposes the controllers it was built from.
  #onDispose?: () => Promise<void>;

  constructor(protected server: ListenServer, onDispose?: () => Promise<void>) {
    this.#onDispose = onDispose;
  }

  listen(port: number, cb: (ctx: HTTP) => void, host?: string) {
    this.#port = port;
    if (host) this.server.listen(port, host, () => cb(this));
    else this.server.listen(port, () => cb(this));
  }

  get port() {
    return this.#port;
  }

  /** Stop accepting connections and resolve once the server has closed. */
  close(): Promise<void> {
    // Nothing to close if it was built but never `listen`ed — avoid the
    // ERR_SERVER_NOT_RUNNING that server.close() would otherwise throw.
    if (!this.server.listening) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
      // Drop idle keep-alive sockets so close() doesn't hang on them. Present on
      // http.Server and (at runtime) http2 servers, but not in the h2 types.
      (this.server as { closeAllConnections?: () => void }).closeAllConnections?.();
    });
  }

  /**
   * Gracefully drain the server: run `onShutdown` (e.g. flip a readiness probe to
   * failing so a load balancer stops routing), stop accepting new connections,
   * drop IDLE keep-alive sockets, let in-flight requests finish — but force any
   * stragglers closed after `timeout` ms — then dispose controllers. Unlike
   * {@link close} (which closes everything at once), this waits for in-flight work.
   */
  async drain(opts: ShutdownOptions = {}): Promise<void> {
    const timeoutMs = opts.timeout ?? 10_000;
    const server = this.server as ListenServer & {
      closeIdleConnections?(): void;
      closeAllConnections?(): void;
    };
    try {
      await opts.onShutdown?.();
    } catch {
      /* a failing shutdown hook must not block the drain */
    }
    if (server.listening) {
      await new Promise<void>((resolve) => {
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
  gracefulShutdown(opts: ShutdownOptions = {}): this {
    const signals = opts.signals ?? (["SIGTERM", "SIGINT"] as NodeJS.Signals[]);
    let started = false;
    for (const sig of signals) {
      process.once(sig, () => {
        if (started) return;
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
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
    await this.#onDispose?.();
  }
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
  guardDocs: { name: string; description?: string }[];
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

// Precompiled at build() so the request hot path does no route parsing.
// `needsBody` is resolved up front; dynamic routes carry a single anchored regex.
interface CompiledRoute {
  handler: HttpHandler;
  schema?: RouteSchema;
  guards?: Guard[];
  /** Decorator-attached interceptors wrapping the handler (after guards). */
  interceptors?: Interceptor[];
  needsBody: boolean;
  matcher?: RegExp; // dynamic routes only
  paramNames?: string[]; // dynamic routes only
  /** Precompiled JSON serializers keyed by status (from the response schema). */
  serializers?: Record<number, (v: unknown) => string>;
  /** Path-scoped middleware that applies to this route, in registration order. */
  middleware: Middleware[];
}

/** A registered middleware: global (no prefix) or scoped to a path prefix. */
interface MiddlewareEntry {
  prefix?: string;
  mw: Middleware;
}

/** Does a `use(prefix, …)` scope cover this route path? */
function prefixCovers(prefix: string, path: string): boolean {
  if (prefix === "/" || prefix === path) return true;
  return path.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}

interface CompiledWsRoute {
  matcher: RegExp;
  handlers: WsHandlers;
}

// ── Compiled JSON serialization ──────────────────────────────────────────────
// A route with a `response` schema gets a serializer compiled once from the
// schema shape (closure-composed, no eval): precomputed keys, no per-request
// property enumeration. Faster than generic JSON.stringify and exact, because
// the value was already coerced to the schema by output validation.
type JsonSer = (v: unknown) => string;

function compileJsonSerializer(node: JsonSchema | undefined): JsonSer {
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
        if (!Array.isArray(v)) return "null";
        let s = "[";
        for (let i = 0; i < v.length; i++) s += (i ? "," : "") + item(v[i]);
        return s + "]";
      };
    }
    case "object": {
      const props: Record<string, JsonSchema> = node.properties ?? {};
      const required = new Set<string>(node.required ?? []);
      const fields = Object.keys(props).map((k) => ({
        key: k,
        prefix: JSON.stringify(k) + ":",
        ser: compileJsonSerializer(props[k]),
        optional: !required.has(k),
      }));
      return (v) => {
        if (v == null || typeof v !== "object") return "null";
        const obj = v as Record<string, unknown>;
        let s = "{";
        let first = true;
        for (const f of fields) {
          const val = obj[f.key];
          if (val === undefined && f.optional) continue;
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

function compileResponseSerializers(
  response: RouteSchema["response"],
): Record<number, JsonSer> | undefined {
  if (!response) return undefined;
  const out: Record<number, JsonSer> = {};
  if (isSchema(response)) {
    out[200] = compileJsonSerializer(toJsonSchema(response));
  } else {
    for (const [status, schema] of Object.entries(response)) {
      out[Number(status)] = compileJsonSerializer(toJsonSchema(schema));
    }
  }
  return out;
}

// Shared empty bag for routes with no params/query — avoids allocating two
// throwaway objects on every request to a static, query-less route.
const EMPTY_BAG: Record<string, string> = {};

// Correlation id: a per-process counter is ~two orders of magnitude cheaper
// than crypto.randomUUID() on the request hot path, while staying unique within
// the process (an inbound x-request-id still wins for cross-service tracing).
const ID_PREFIX = `${process.pid.toString(36)}-`;
let idSeq = 0;
function fastId(): string {
  return ID_PREFIX + (++idSeq).toString(36);
}

class HttpTransport {
  // Static paths: O(1) two-level lookup (method → path) so the hot path never
  // builds a `"METHOD /path"` key string. Dynamic paths: per-method list.
  #static = new Map<string, Map<string, CompiledRoute>>();
  #dynamic = new Map<string, CompiledRoute[]>();
  #wsRoutes: CompiledWsRoute[] = [];
  // Global middleware wrap routing (see #handle); scoped ones are folded into
  // each matching route's `middleware` list below.
  #globalMw: Middleware[];

  constructor(
    httpRoutes: HttpRouteDef[],
    wsRoutes: WsRouteDef[],
    middleware: readonly MiddlewareEntry[] = [],
  ) {
    this.#globalMw = middleware.filter((e) => !e.prefix).map((e) => e.mw);
    const scoped = middleware.filter((e) => e.prefix);
    const routeMw = (path: string): Middleware[] =>
      scoped.filter((e) => prefixCovers(e.prefix!, path)).map((e) => e.mw);

    for (const r of httpRoutes) {
      const method = r.method.toUpperCase();
      const needsBody =
        (method === "POST" ||
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
        if (!list) this.#dynamic.set(method, (list = []));
        list.push({ handler: r.handler, schema: r.schema, guards: r.guards, interceptors: r.interceptors, needsBody, matcher, paramNames, serializers, middleware: mw });
      } else {
        let byPath = this.#static.get(method);
        if (!byPath) this.#static.set(method, (byPath = new Map()));
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

  /** A bare `(req, res) => void` over the compiled routes — for embedding in a
   *  foreign `node:http`-compatible server or a Web-`fetch` bridge. */
  requestListener(): NodeRequestListener {
    return (req, res) => void this.#dispatch(req as HttpRequest, res as HttpResponse);
  }

  build(onDispose?: () => Promise<void>, opts: ListenOptions = {}): HTTP {
    const server = createListenServer(opts, (req, res) =>
      this.#dispatch(req as HttpRequest, res as ServerResponse),
    );
    // WebSocket upgrades ride HTTP/1.1 — skip wiring it on pure h2 (no upgrade event).
    if (this.#wsRoutes.length && supportsWsUpgrade(opts)) {
      server.on("upgrade", (req, socket) => this.#upgrade(req, socket as Duplex));
    }
    return new HTTP(server, onDispose);
  }

  // Guards then handler — the core wrapped by per-route middleware. Hoisted
  // (class field arrow) so it isn't reallocated per request.
  #runRoute = async (ctx: Context, route: CompiledRoute): Promise<unknown> => {
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
  #resolve = async (ctx: HttpContext): Promise<unknown> => {
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
    let params: Record<string, string> = EMPTY_BAG;
    if (!route) {
      const candidates = this.#dynamic.get(method);
      if (candidates) {
        for (const r of candidates) {
          const m = r.matcher!.exec(pathname);
          if (!m) continue;
          const names = r.paramNames!;
          const p: Record<string, string> = {};
          for (let i = 0; i < names.length; i++) p[names[i]] = decodeURIComponent(m[i + 1]);
          params = p;
          route = r;
          break;
        }
      }
    }

    if (!route) return Response.json({ error: "Not Found" }, { status: 404 });

    // Parse the query string only when present (skip the no-query common case).
    const qs = qi === -1 ? "" : rawUrl.slice(qi + 1);
    let query: Record<string, string> = qs
      ? Object.fromEntries(new URLSearchParams(qs))
      : EMPTY_BAG;

    let body: unknown;
    if (route.needsBody) body = await readBody(req);

    // ── Input validation (coerces) ──
    const schema = route.schema;
    if (schema) {
      const code = schema.invalidStatus;
      if (schema.params)
        params = validate(schema.params, params, code) as Record<string, string>;
      if (schema.query)
        query = validate(schema.query, query, code) as Record<string, string>;
      if (schema.body) body = validate(schema.body, body, code);
    }
    ctx.params = params;
    ctx.query = query;
    ctx.body = body;

    // Per-route middleware wraps guards+interceptors+handler. With neither
    // middleware nor interceptors → inline (no hop); otherwise route through
    // #runRoute (the single place guards + interceptors + handler compose).
    const mws = route.middleware;
    let result: unknown;
    if (mws.length === 0 && !route.interceptors?.length) {
      if (route.guards) {
        for (const g of route.guards) {
          if ((await g(ctx)) === false) throw new HttpError(403, { error: "Forbidden" });
        }
      }
      result = await route.handler(ctx);
    } else {
      result = await runMiddleware(mws, ctx, () => this.#runRoute(ctx, route));
    }

    // ── Output validation, keyed by the status the handler chose ──
    const status = isResult(result) ? result.status : 200;
    if (schema?.response && !res.writableEnded) {
      const outSchema = responseSchemaFor(schema.response, status);
      if (outSchema) {
        const raw = isResult(result) ? result.body : result;
        let validated: unknown;
        try {
          validated = validate(outSchema, raw);
        } catch (e) {
          // A bad response is a server bug, not a client error.
          throw new HttpError(500, {
            error: "Response validation failed",
            issues: e instanceof ValidationError ? e.issues : undefined,
          });
        }
        if (isResult(result)) result.body = validated;
        else result = validated;
      }
    }
    ctx._serializer = route.serializers?.[status];
    return result;
  };

  // Global middleware wrap routing, so they see every request — 404s, CORS
  // preflight, rate-limit — not just matched routes.
  #handle = (ctx: HttpContext): Promise<unknown> =>
    this.#globalMw.length === 0
      ? this.#resolve(ctx)
      : runMiddleware(this.#globalMw, ctx, () => this.#resolve(ctx));

  async #dispatch(req: HttpRequest, res: HttpResponse) {
    // Correlation id: honour an incoming one, else mint a cheap one; echo it back.
    const incoming = req.headers["x-request-id"];
    const requestId =
      (typeof incoming === "string" && incoming) || fastId();
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
        if (pending) await pending;
      }
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) {
          const desc =
            typeof err.payload === "string"
              ? Response.text(err.payload, { status: err.status })
              : Response.json(err.payload, { status: err.status });
          await send(res, desc, negotiate(req.headers.accept));
        } else if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  }

  #upgrade(req: IncomingMessage, socket: Duplex) {
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
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const ws = new WsConnection(socket);
    const { handlers } = route;
    handlers.open?.(ws);

    ws.on("message", async (msg: string) => {
      try {
        const out = handlers.message?.(ws, msg);
        if (isStreamable(out)) {
          for await (const chunk of out as AsyncIterable<unknown>) {
            ws.send(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
          }
        } else {
          await out;
        }
      } catch (err) {
        console.error(err);
        ws.close(1011);
      }
    });

    ws.on("close", () => handlers.close?.(ws));
  }
}

// ============================================================
// API documents (OpenAPI / AsyncAPI) — pluggable generators
// ------------------------------------------------------------
// The route metadata is the single source of truth. A DocumentGenerator
// turns it into a spec; OpenAPI and AsyncAPI are just two built-ins. A new
// format = a new generator function, no framework changes — mount it with
// `.document(path, generator)`.
// ============================================================

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

function generateOpenAPI(routes: ApiRoutes, info?: DocInfo): unknown {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of routes.http) {
    if (r.hidden) continue;

    const oaPath = r.path.replace(/:([^/]+)/g, "{$1}");
    const operation: Record<string, unknown> = {};
    const parameters: JsonSchema[] = [];

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
      const required = new Set<string>(q.required ?? []);
      for (const [name, schema] of Object.entries(q.properties ?? {})) {
        parameters.push({ name, in: "query", required: required.has(name), schema });
      }
    }

    if (parameters.length) operation.parameters = parameters;

    if (r.schema?.body) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: toJsonSchema(r.schema.body) } },
      };
    }

    const responses: Record<string, unknown> = {};
    const resp = r.schema?.response;
    if (resp && isSchema(resp)) {
      responses["200"] = jsonContent("OK", resp);
    } else if (resp) {
      for (const [status, schema] of Object.entries(resp)) {
        responses[status] = jsonContent(`Response ${status}`, schema);
      }
    } else {
      responses["200"] = { description: "OK" };
    }
    operation.responses = responses;

    // Guard/interceptor self-descriptions (harvested via the `describing` pass):
    // surface them as the operation description + an `x-guards` vendor extension.
    if (r.meta?.length) {
      const descriptions = r.meta.map((m) => m.description).filter(Boolean);
      if (descriptions.length) operation.description = descriptions.join("\n");
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

function jsonContent(description: string, schema: Schema): JsonSchema {
  return {
    description,
    content: { "application/json": { schema: toJsonSchema(schema) } },
  };
}

function generateAsyncAPI(routes: ApiRoutes, info?: DocInfo): unknown {
  const channels: Record<string, unknown> = {};

  for (const w of routes.ws) {
    const channel: Record<string, unknown> = {};
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

// ============================================================
// Application — fluent (Elysia-style) builder
// ============================================================

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
  beforeListen?(info: { port: number; opts: ListenOptions }): boolean | void;
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

class AppBuilder {
  #http: HttpRouteDef[] = [];
  #ws: WsRouteDef[] = [];
  #sse: SseRouteDef[] = [];
  #middleware: MiddlewareEntry[] = [];
  // Mounted controller instances, kept so their disposers can run at shutdown.
  #controllers: object[] = [];
  #plugins: ServerPlugin[] = [];
  #disposed = false;

  constructor(controllers: ControllerClass[]) {
    for (const Ctrl of controllers) this.controller(Ctrl);
  }

  /**
   * Register one or more {@link ServerPlugin}s. `setup` runs now (so a plugin can
   * add middleware/routes before the server is built); `onListen`/`onShutdown`
   * run when the server starts/drains.
   */
  plugin(...plugins: ServerPlugin[]): this {
    for (const p of plugins) {
      this.#plugins.push(p);
      p.setup?.(this);
    }
    return this;
  }

  // Plugin onShutdown hooks, reverse order (LIFO — mirror controller disposal).
  #runShutdown = async (): Promise<void> => {
    for (let i = this.#plugins.length - 1; i >= 0; i--) {
      try {
        await this.#plugins[i].onShutdown?.();
      } catch {
        /* a plugin's shutdown must not block the rest of the drain */
      }
    }
  };

  // Plugin onListen hooks, registration order, after the socket is bound.
  #runOnListen = async (http: HTTP): Promise<void> => {
    for (const p of this.#plugins) {
      try {
        await p.onListen?.(http);
      } catch (err) {
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
  use(pathOrMw: string | Middleware, ...rest: Middleware[]): this {
    if (typeof pathOrMw === "string") {
      const prefix = normalizePath(pathOrMw);
      for (const mw of rest) this.#middleware.push({ prefix, mw });
    } else {
      for (const mw of [pathOrMw, ...rest]) this.#middleware.push({ mw });
    }
    return this;
  }

  /** Mount a decorator-based controller class. */
  controller(Ctrl: ControllerClass): this {
    const instance = new Ctrl(); // runs initializers -> fills the registry
    // Install providers once on the singleton instance (adds `this.orm` etc.),
    // before handlers bind so they're present for the first request.
    for (const p of Ctrl.providers ?? []) p.install(instance as object);
    this.#controllers.push(instance);
    const base = Ctrl.basePath ?? "";
    const classGuards = Ctrl.guards ?? [];
    const classInterceptors = Ctrl.interceptors ?? [];
    const classMiddlewares = Ctrl.middlewares ?? [];
    for (const route of getRoutes(Ctrl)) {
      if (route.protocol !== "http") continue;
      const handler = (instance as unknown as Record<string, HttpHandler>)[
        route.handlerName
      ].bind(instance);
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
  topology(): AppTopology {
    const resp = (r?: Schema | Record<number, Schema>): JsonSchema | undefined => {
      if (!r) return undefined;
      if (isSchema(r)) return toJsonSchema(r);
      const map = r as Record<number, Schema>;
      const pick = map[200] ?? Object.values(map)[0];
      return pick ? toJsonSchema(pick) : undefined;
    };
    const part = (s?: Schema): JsonSchema | undefined => (s ? toJsonSchema(s) : undefined);
    const routes: RouteTopology[] = [];
    for (const r of this.#http) {
      if (r.hidden) continue;
      routes.push({
        method: r.method.toUpperCase(),
        path: r.path,
        controller: r.controller,
        guards: r.guards?.length ?? 0,
        guardNames: r.guards?.map(guardDocName) ?? [],
        guardDocs:
          r.guards?.map((g) => {
            const d = (g as { doc?: ContextMetaInit | string }).doc; // string (legacy) or { name, … }
            return typeof d === "object" && d ? { name: d.name ?? g.name ?? "guard", description: d.description } : { name: guardDocName(g) };
          }) ?? [],
        interceptors: r.interceptors?.length ?? 0,
        kind: "http",
        schema: r.schema
          ? { params: part(r.schema.params), query: part(r.schema.query), body: part(r.schema.body || undefined), response: resp(r.schema.response) }
          : undefined,
      });
    }
    for (const w of this.#ws) routes.push({ method: "WS", path: w.path, guards: 0, guardNames: [], guardDocs: [], interceptors: 0, kind: "ws" });
    for (const s of this.#sse) routes.push({ method: "SSE", path: s.path, guards: 0, guardNames: [], guardDocs: [], interceptors: 0, kind: "sse" });
    const plugins: PluginInfo[] = this.#plugins.map((p) => {
      let info: unknown;
      try {
        info = p.inspect?.();
      } catch {
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
  async tryGuards(
    method: string,
    path: string,
    init: { headers?: Record<string, string>; params?: Record<string, string>; query?: Record<string, string>; body?: unknown } = {},
  ): Promise<GuardTrial[]> {
    const m = method.toUpperCase();
    const route = this.#http.find((r) => r.method.toUpperCase() === m && r.path === path);
    if (!route) return [{ name: "(route)", outcome: "error", message: `no ${m} route at ${path}` }];
    const guards = route.guards ?? [];
    const ctx = stubContext(m, path, init);
    const trials: GuardTrial[] = [];
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
        } else {
          trials.push({ name, outcome: "passed" });
        }
      } catch (e) {
        if (e instanceof HttpError) {
          trials.push({ name, outcome: "denied", status: e.status, message: typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload) });
        } else {
          trials.push({ name, outcome: "error", status: 500, message: e instanceof Error ? e.message : String(e) });
        }
        stopped = true;
      }
    }
    return trials;
  }

  get<const Sch extends RouteSchema = {}>(
    path: string,
    handler: TypedHandler<Sch> | HttpResult,
    schema?: Sch,
  ): this {
    return this.#add("GET", path, handler, schema);
  }
  post<const Sch extends RouteSchema = {}>(
    path: string,
    handler: TypedHandler<Sch> | HttpResult,
    schema?: Sch,
  ): this {
    return this.#add("POST", path, handler, schema);
  }
  put<const Sch extends RouteSchema = {}>(
    path: string,
    handler: TypedHandler<Sch> | HttpResult,
    schema?: Sch,
  ): this {
    return this.#add("PUT", path, handler, schema);
  }
  patch<const Sch extends RouteSchema = {}>(
    path: string,
    handler: TypedHandler<Sch> | HttpResult,
    schema?: Sch,
  ): this {
    return this.#add("PATCH", path, handler, schema);
  }
  delete<const Sch extends RouteSchema = {}>(
    path: string,
    handler: TypedHandler<Sch> | HttpResult,
    schema?: Sch,
  ): this {
    return this.#add("DELETE", path, handler, schema);
  }
  /** HTTP QUERY (safe, idempotent, body-carrying — RFC 9110-style). Use for
   *  reads whose query is too large/structured for the URL; responses are
   *  cacheable by content (see `createCache`). The query lives in `ctx.body`. */
  query<const Sch extends RouteSchema = {}>(
    path: string,
    handler: TypedHandler<Sch> | HttpResult,
    schema?: Sch,
  ): this {
    return this.#add("QUERY", path, handler, schema);
  }

  ws(path: string, handlers: WsHandlers): this {
    this.#ws.push({ path: normalizePath(path), handlers });
    return this;
  }

  /** Server-Sent Events stream — same handler shape spirit as `.ws`. */
  sse(path: string, handlers: SseHandlers): this {
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
  document(path: string, generate: DocumentGenerator): this {
    let cached: unknown;
    this.#http.push({
      method: "GET",
      path: normalizePath(path),
      hidden: true,
      // Lazy: generated on first request, after all routes are registered. The
      // guard/interceptor `meta` is harvested first so the spec can describe them.
      handler: async () => {
        await this.#collectMeta();
        return Response.json(
          (cached ??= generate({ http: this.#http, ws: this.#ws, sse: this.#sse })),
        );
      },
    });
    return this;
  }

  // Harvest each route's guard/interceptor `meta` ONCE (the first time any doc is
  // generated) by running them against a `describing` probe context — off the
  // request hot path entirely. Annotators that declare `ctx.meta` before their
  // I/O (or short-circuit on `ctx.describing`) are documented; throws are ignored.
  #metaCollected = false;
  async #collectMeta(): Promise<void> {
    if (this.#metaCollected) return;
    this.#metaCollected = true;
    for (const route of this.#http) {
      const annotators = [...(route.guards ?? []), ...(route.interceptors ?? [])];
      if (!annotators.length) continue;
      const collected: ContextMeta[] = [];
      for (const fn of annotators) {
        const ctx = describeContext(route.method, route.path);
        try {
          await (fn as (c: Context, next: Next) => unknown)(ctx, () => Promise.resolve(undefined));
        } catch {
          // only the meta declared before any failure matters
        }
        if (hasOwnKeys(ctx.meta)) collected.push(ctx.meta);
      }
      if (collected.length) route.meta = collected;
    }
  }

  openapi(opts?: DocInfo & { path?: string }): this {
    return this.document(opts?.path ?? "/openapi.json", (routes) =>
      generateOpenAPI(routes, opts),
    );
  }

  asyncapi(opts?: DocInfo & { path?: string }): this {
    return this.document(opts?.path ?? "/asyncapi.json", (routes) =>
      generateAsyncAPI(routes, opts),
    );
  }

  #add(
    method: string,
    path: string,
    handler: ((...args: any[]) => MaybePromise<unknown>) | HttpResult,
    schema?: RouteSchema,
  ): this {
    // A bare descriptor (File("x"), Response({...})) becomes a constant route.
    const fn: HttpHandler = isResult(handler)
      ? () => handler
      : (handler as HttpHandler);
    this.#http.push({ method, path: normalizePath(path), handler: fn, schema });
    return this;
  }

  /**
   * A runtime-agnostic Node-style request listener `(req, res) => void` built from
   * the compiled routes. Mount it on any `node:http`-compatible server, or hand it
   * to `@youneed/server-adapter` to run the SAME app on Bun / Deno / edge via a Web
   * `fetch` handler.
   *
   * NOTE: this is a STATELESS dispatcher — plugin `onListen`/shutdown lifecycle runs
   * only through {@link listen}. Use a runtime adapter's `serve()` if you need it.
   */
  handler(): NodeRequestListener {
    return new HttpTransport(this.#http, this.#ws, this.#middleware).requestListener();
  }

  buildHTTP(opts: ListenOptions = {}): HTTP {
    return new HttpTransport(this.#http, this.#ws, this.#middleware).build(
      // Drain order: plugins first (LIFO), then mounted controllers.
      async () => {
        await this.#runShutdown();
        await this.#disposeControllers();
      },
      opts,
    );
  }

  listen(port: number, cb: (ctx: HTTP) => void): HTTP;
  listen(port: number, opts: ListenOptions, cb: (ctx: HTTP) => void): HTTP;
  listen(
    port: number,
    optsOrCb: ListenOptions | ((ctx: HTTP) => void),
    cb?: (ctx: HTTP) => void,
  ): HTTP {
    const opts = typeof optsOrCb === "function" ? {} : optsOrCb;
    const done = typeof optsOrCb === "function" ? optsOrCb : cb!;
    // A plugin may TAKE OVER the bind (cluster primary forks workers instead of
    // listening). It returns a non-listening stub whose drain still runs the
    // plugin onShutdown hooks (so the primary forwards signals to its workers).
    for (const p of this.#plugins) {
      if (p.beforeListen?.({ port, opts }) === false) {
        const stub = new HTTP(
          { listening: false } as unknown as ListenServer,
          () => this.#runShutdown(),
        );
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
  #disposeControllers(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#disposed = true;
    return disposeAll(this.#controllers);
  }

  /** `await using app = Application(...)` releases controllers on scope exit. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.#disposeControllers();
  }
}

function Application(...controllers: ControllerClass[]): AppBuilder {
  return new AppBuilder(controllers);
}

// ============================================================
// Path helpers
// ============================================================

function normalizePath(path: string): string {
  const cleaned = ("/" + path).replace(/\/+/g, "/").replace(/\/$/, "");
  return cleaned === "" ? "/" : cleaned;
}

function compilePath(path: string): { matcher: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const pattern = path.replace(/:([^/]+)/g, (_, name: string) => {
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
async function collectRaw(req: IncomingMessage): Promise<Buffer> {
  const cached = (req as unknown as Record<symbol, Buffer | undefined>)[RAW_BODY];
  if (cached !== undefined) return cached;
  const limit = (req as unknown as Record<symbol, number | undefined>)[BODY_LIMIT];
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (limit !== undefined && total > limit) {
      throw new HttpError(413, { error: "Payload Too Large", limit });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks);
  (req as unknown as Record<symbol, Buffer>)[RAW_BODY] = raw;
  return raw;
}

/**
 * The exact raw request-body bytes, memoized on the request. Safe to call from a
 * middleware AND have the handler still receive a parsed `ctx.body` — both share
 * the one drained buffer (no double-read of the consumed stream). Used by
 * signature-verifying middleware (`@youneed/server-middleware-webhook-signature`)
 * that must hash the bytes exactly as the client sent them.
 */
function rawBody(source: Context | HttpRequest): Promise<Buffer> {
  const req = ((source as Context).request ?? source) as IncomingMessage;
  return collectRaw(req);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const raw = await collectRaw(req);
  if (raw.length === 0) return undefined;

  // Lowercase only for type detection — the multipart boundary is case-sensitive
  // (Bun uses `WebkitFormBoundary…`), so extract it from the original header.
  const rawType = String(req.headers["content-type"] ?? "");
  const type = rawType.toLowerCase();

  if (type.includes("application/json")) {
    const text = raw.toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
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
  if (type === "" || type.startsWith("text/")) return raw.toString("utf8");
  return raw;
}

// ============================================================
// multipart/form-data parsing (buffered)
// ============================================================

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

const CRLF2 = Buffer.from("\r\n\r\n");

function splitBuffer(buf: Buffer, sep: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let i: number;
  while ((i = buf.indexOf(sep, start)) !== -1) {
    parts.push(buf.subarray(start, i));
    start = i + sep.length;
  }
  parts.push(buf.subarray(start));
  return parts;
}

/** Parse a buffered multipart/form-data body into fields + files. */
function parseMultipart(buf: Buffer, boundary: string): MultipartBody {
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];
  for (let part of splitBuffer(buf, Buffer.from(`--${boundary}`))) {
    if (part.length === 0) continue;
    if (part[0] === 0x0d && part[1] === 0x0a) part = part.subarray(2); // leading CRLF
    if (part.length >= 2 && part[0] === 0x2d && part[1] === 0x2d) continue; // closing "--"
    const sep = part.indexOf(CRLF2);
    if (sep === -1) continue;
    const rawHeaders = part.subarray(0, sep).toString("utf8");
    let body = part.subarray(sep + CRLF2.length);
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.subarray(0, body.length - 2); // trailing CRLF before next boundary
    }
    const headers: Record<string, string> = {};
    for (const line of rawHeaders.split("\r\n")) {
      const c = line.indexOf(":");
      if (c !== -1) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
    }
    const cd = headers["content-disposition"] ?? "";
    const name = /name="([^"]*)"/.exec(cd)?.[1];
    if (name === undefined) continue;
    const filename = /filename="([^"]*)"/.exec(cd)?.[1];
    if (filename !== undefined) {
      files.push({ name, filename, contentType: headers["content-type"], data: Buffer.from(body) });
    } else {
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Generic fallback encoders for values that don't own a representation.
function toXml(value: unknown, tag = "root"): string {
  if (value === null || value === undefined) return `<${tag}/>`;
  if (Array.isArray(value)) return value.map((v) => toXml(v, "item")).join("");
  if (typeof value === "object") {
    const inner = Object.entries(value)
      .map(([k, v]) => toXml(v, k))
      .join("");
    return `<${tag}>${inner}</${tag}>`;
  }
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

function toFix(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  // real FIX uses SOH (\x01) + numeric tags; "|" + keys here for readability
  return Object.entries(value)
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

const formatEncoders: Record<string, (value: unknown) => string> = {
  json: (v) => JSON.stringify(v),
  xml: (v) => toXml(v),
  fix: (v) => toFix(v),
};

function contentTypeOf(kind: SerializeKind): string {
  switch (kind) {
    case "xml":
      return "application/xml; charset=utf-8";
    case "fix":
      return "application/fix";
    default:
      return "application/json";
  }
}

function parseAccept(accept: string): { type: string; q: number }[] {
  return accept.split(",").map((part) => {
    const [type, ...params] = part.trim().split(";");
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
    return { type: type.trim().toLowerCase(), q: Number.isNaN(q) ? 1 : q };
  });
}

// Accept headers are low-cardinality (a handful of clients) — cache the parse.
const negotiationCache = new Map<string, SerializeKind>();

function negotiate(accept?: string): SerializeKind {
  if (!accept) return "json";
  let kind = negotiationCache.get(accept);
  if (kind === undefined) {
    kind = chooseKind(accept);
    if (negotiationCache.size > 256) negotiationCache.clear();
    negotiationCache.set(accept, kind);
  }
  return kind;
}

function chooseKind(accept?: string): SerializeKind {
  if (!accept) return "json";
  const entries = parseAccept(accept);

  // Browser heuristic: a client asking for text/html (which we don't serve)
  // is a browser, not an API client wanting XML/FIX — default it to JSON.
  if (entries.some((e) => e.type === "text/html")) return "json";

  const best = (types: string[]) =>
    Math.max(0, ...entries.filter((e) => types.includes(e.type)).map((e) => e.q));

  // JSON listed first so it wins ties (the sane default).
  const ranked: [SerializeKind, number][] = [
    ["json", best(["application/json", "*/*"])],
    ["xml", best(["application/xml", "text/xml"])],
    ["fix", best(["application/fix"])],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "json";
}

/** Handler that always responds in a fixed format, ignoring Accept. */
function respondAs(make: () => unknown, kind: SerializeKind): HttpHandler {
  return (ctx) => {
    ctx.response.writeHead(200, { "Content-Type": contentTypeOf(kind) });
    ctx.response.end(serialize(make(), kind));
  };
}

/** Variant 1: the value owns its representation; generic encoder otherwise. */
function serialize(value: unknown, kind: SerializeKind): string {
  const own = (value as { [Symbol.toSerialize]?: unknown })?.[Symbol.toSerialize];
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
  Application,
  Controller,
  // Guard/interceptor documentation wrappers
  withDocumentation,
  guardWithDocumentation,
  // Response descriptors
  Response,
  File,
  cacheControl,
  clearSiteData,
  // Schema / validation
  t,
  validate,
  isSchema,
  toJsonSchema,
  // Errors
  HttpError,
  ValidationError,
  // Request-scoped context
  context,
  trace,
  // Response cache (bound to the serialization/send engine, so it lives in core)
  createCache,
  createDistributedCache,
  // Primitives the @youneed/server-middleware-* packages build on
  isResult,
  appendVary as vary,
  BODY_LIMIT,
  rawBody,
  // Serialization / content negotiation
  serialize,
  negotiate,
  contentTypeOf,
  respondAs,
};

export type {
  AppBuilder,
  AppTopology,
  RouteTopology,
  PluginInfo,
  GuardTrial,
  ControllerClass,
  ControllerConfig,
  RequestLogger,
  Context,
  ContextMeta,
  ContextMetaInit,
  ServerPlugin,
  Guard,
  TypedHandler,
  HttpHandler,
  HttpResult,
  FileOptions,
  CacheControl,
  ClearSiteDataDirective,
  RouteSchema,
  Schema,
  SchemaMeta,
  Infer,
  SerializeKind,
  ShutdownOptions,
  Issue,
  WsHandlers,
  SseHandlers,
  SseEvent,
  HTTP,
  // Middleware infrastructure (the contract the server-middleware-* packages use)
  Middleware,
  Interceptor,
  Next,
  CookieJar,
  CookieOptions,
  // Response cache (stays in core)
  Cache,
  CacheOptions,
  // Distributed response cache (async, KV-backed)
  CacheStore,
  DistributedCache,
  DistributedCacheOptions,
  MultipartBody,
  MultipartFile,
};
