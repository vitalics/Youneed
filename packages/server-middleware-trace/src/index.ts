// @youneed/server middleware — W3C-traceparent distributed tracing. Dependency-free
// and OpenTelemetry-compatible (16-byte trace id / 8-byte span id, all lowercase hex)
// without pulling in the OTel SDK. Parses an incoming `traceparent`, starts a span for
// the request, propagates a `traceparent` response header, and hands the finished span
// to `opts.onEnd` so you can export it to OTel / Jaeger / Zipkin / a log line.
//
//   app.use(tracing({ onEnd: (s) => exporter.push(s) }))
//      .get("/users", (ctx) => {
//        span(ctx).setAttribute("user.count", 3);
//        span(ctx).addEvent("queried-db");
//        return Response.json([ /* … */ ]);
//      });
//   // → traceparent: 00-<32 hex traceId>-<16 hex spanId>-01
//
// W3C Trace Context (https://www.w3.org/TR/trace-context/) `traceparent` format:
//   version "-" trace-id "-" parent-id "-" trace-flags
//   "00"    "-" 32 hex   "-" 16 hex    "-" 2 hex   (flags 01 = sampled)
// An incoming traceparent's `parent-id` becomes this span's parent; the trace-id is
// reused so the whole call tree shares one trace.
import { randomBytes } from "node:crypto";
import type { Context, Middleware } from "@youneed/server";

export interface TracingOptions {
  /** Emit the `traceparent` response header so downstream/clients can correlate
   *  (default `true`). */
  responseHeader?: boolean;
  /** Called in a `finally` with the finished span (duration recorded) — the
   *  integration hook: export to OpenTelemetry/Jaeger/Zipkin, log it, etc. */
  onEnd?: (span: Span) => void;
}

/** A timestamped point within a span (W3C/OTel "event"). */
export interface SpanEvent {
  name: string;
  /** Epoch milliseconds (`Date.now()`) when the event was recorded. */
  time: number;
}

/** A single unit of traced work for the request. Mutable while the request runs;
 *  frozen-in-time once {@link Span.end} sets {@link Span.endTime}/{@link Span.duration}. */
export interface Span {
  /** 16-byte trace id as 32 lowercase hex chars — shared across the whole trace. */
  readonly traceId: string;
  /** 8-byte span id as 16 lowercase hex chars — unique to this span. */
  readonly spanId: string;
  /** Parent span id (the incoming `parent-id`), when this continues an upstream trace. */
  readonly parentId?: string;
  /** Low-cardinality span name, e.g. `"GET /users"` (path without query string). */
  name: string;
  /** Epoch milliseconds when the span started. */
  readonly startTime: number;
  /** Epoch milliseconds when {@link Span.end} was called (else `undefined`). */
  endTime?: number;
  /** `endTime - startTime` once ended (else `undefined`). */
  duration?: number;
  /** Arbitrary span attributes (OTel-style key/value bag). */
  attributes: Record<string, unknown>;
  /** Timestamped events recorded during the span. */
  events: SpanEvent[];
  /** Record/overwrite an attribute. Returns the span for chaining. */
  setAttribute(key: string, value: unknown): Span;
  /** Append a {@link SpanEvent} stamped with the current time. Returns the span. */
  addEvent(name: string): Span;
  /** Stamp `endTime`/`duration` (idempotent — only the first call counts). */
  end(): void;
}

const STATE_KEY = "span";

/** A frozen no-op span returned by {@link span} when `tracing()` isn't installed,
 *  so handlers can call `span(ctx).setAttribute(...)` unconditionally. */
const NOOP: Span = {
  traceId: "00000000000000000000000000000000",
  spanId: "0000000000000000",
  name: "",
  startTime: 0,
  attributes: {},
  events: [],
  setAttribute() {
    return NOOP;
  },
  addEvent() {
    return NOOP;
  },
  end() {},
};

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** A trace/span id is "all zeroes" — invalid per the spec. */
function isZero(hex: string): boolean {
  return /^0+$/.test(hex);
}

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

interface IncomingTrace {
  traceId: string;
  parentId: string;
}

/** Parse an incoming `traceparent` header, or `undefined` if absent/malformed. */
function parseTraceparent(header: string | string[] | undefined): IncomingTrace | undefined {
  if (typeof header !== "string") return undefined;
  const m = TRACEPARENT.exec(header.trim());
  if (!m) return undefined;
  const [, traceId, parentId] = m;
  if (isZero(traceId) || isZero(parentId)) return undefined; // all-zero ids are invalid
  return { traceId, parentId };
}

/**
 * Access the per-request {@link Span}. Returns a no-op span when the `tracing()`
 * middleware isn't installed, so handlers can record attributes/events safely.
 */
export function span(ctx: Context): Span {
  return (ctx.state[STATE_KEY] as Span | undefined) ?? NOOP;
}

/**
 * W3C-traceparent distributed-tracing middleware. Register early so it spans every
 * request. Reuses an incoming trace id (continuing the upstream trace) or starts a
 * fresh one, sets the `traceparent` response header, and on completion records the
 * duration and invokes {@link TracingOptions.onEnd}.
 */
export function tracing(opts: TracingOptions = {}): Middleware {
  const emitHeader = opts.responseHeader ?? true;
  return async (ctx, next) => {
    const incoming = parseTraceparent(ctx.request.headers["traceparent"]);
    const traceId = incoming?.traceId ?? hex(16); // 16 bytes → 32 hex
    const spanId = hex(8); // 8 bytes → 16 hex

    const sp: Span = {
      traceId,
      spanId,
      parentId: incoming?.parentId,
      name: ctx.request.method ?? "",
      startTime: Date.now(),
      attributes: {},
      events: [],
      setAttribute(key, value) {
        this.attributes[key] = value;
        return this;
      },
      addEvent(name) {
        this.events.push({ name, time: Date.now() });
        return this;
      },
      end() {
        if (this.endTime !== undefined) return;
        this.endTime = Date.now();
        this.duration = this.endTime - this.startTime;
      },
    };
    ctx.state[STATE_KEY] = sp;

    // Propagate our own context downstream/to the client (`01` = sampled).
    if (emitHeader && !ctx.response.headersSent) {
      ctx.response.setHeader("traceparent", `00-${traceId}-${spanId}-01`);
    }

    try {
      return await next();
    } finally {
      // Low-cardinality name: method + path without the query string.
      const method = ctx.request.method ?? "";
      const url = ctx.request.url ?? "";
      const q = url.indexOf("?");
      sp.name = `${method} ${q === -1 ? url : url.slice(0, q)}`.trim();
      sp.end();
      opts.onEnd?.(sp);
    }
  };
}
