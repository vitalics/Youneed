// ── @youneed/server-plugin-otlp — export request traces over OTLP/HTTP ───────
//
// `@youneed/server-middleware-trace` already produces OpenTelemetry-shaped spans
// per request (16-byte trace id / 8-byte span id, attributes, events) and calls
// `onEnd(span)`. This plugin batches those spans, encodes them as **OTLP/HTTP
// JSON** and POSTs them to `{endpoint}/v1/traces` — so a youneed server shows up
// in Jaeger / Tempo / Grafana / an OTel Collector with NO OpenTelemetry SDK.
//
//   app.plugin(otlp({ endpoint: "http://localhost:4318", serviceName: "api" }));
//   // → per-request spans batched + shipped to the collector; a devtools "OTLP" tab.
//
// Point `endpoint` at an OTLP/HTTP receiver (collector `:4318`, Tempo, Jaeger's
// OTLP port…). The plugin installs the tracing middleware for you (opt out with
// `installTracing: false` and wire `tracing({ onEnd: exporter.push })` yourself).

import { tracing, type Span } from "@youneed/server-middleware-trace";
import type { ServerPlugin } from "@youneed/server";
import { Response } from "@youneed/server";

// ── OTLP/HTTP JSON encoding (trace-service ExportTraceServiceRequest) ─────────

type AnyValue = { stringValue: string } | { boolValue: boolean } | { intValue: string } | { doubleValue: number };
interface KeyValue {
  key: string;
  value: AnyValue;
}

/** Encode a JS value as an OTLP `AnyValue`. int64 is a decimal string (JSON proto). */
function anyValue(v: unknown): AnyValue {
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  if (typeof v === "bigint") return { intValue: v.toString() };
  if (typeof v === "string") return { stringValue: v };
  return { stringValue: JSON.stringify(v) };
}

function attributes(bag: Record<string, unknown>): KeyValue[] {
  return Object.entries(bag).map(([key, value]) => ({ key, value: anyValue(value) }));
}

/** ms epoch → nanoseconds as a decimal string (OTLP time fields are uint64). */
const nanos = (ms: number): string => String(Math.round(ms * 1e6));

/** OTLP span status: ERROR (2) when the span looks failed, else UNSET (0). */
function statusCode(span: Span): 0 | 2 {
  const s = span.attributes;
  const http = Number(s["http.status_code"] ?? s["http.response.status_code"]);
  if (s["error"] || s["exception"] || (Number.isFinite(http) && http >= 500)) return 2;
  return 0;
}

/** Convert finished spans → an OTLP/HTTP JSON `ExportTraceServiceRequest` body. */
export function toOtlpTraces(
  spans: Span[],
  resource: Record<string, unknown>,
  scope: { name: string; version?: string },
): unknown {
  return {
    resourceSpans: [
      {
        resource: { attributes: attributes(resource) },
        scopeSpans: [
          {
            scope: { name: scope.name, version: scope.version },
            spans: spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              parentSpanId: span.parentId,
              name: span.name,
              kind: 2, // SPAN_KIND_SERVER — these are inbound request spans
              startTimeUnixNano: nanos(span.startTime),
              endTimeUnixNano: nanos(span.endTime ?? span.startTime),
              attributes: attributes(span.attributes),
              events: span.events.map((e) => ({ timeUnixNano: nanos(e.time), name: e.name })),
              status: { code: statusCode(span) },
            })),
          },
        ],
      },
    ],
  };
}

// ── the exporter ──────────────────────────────────────────────────────────────

export interface OtlpOptions {
  /** OTLP/HTTP receiver base (e.g. `http://localhost:4318`) or a full traces URL. */
  endpoint: string;
  /** Appended to `endpoint` unless it already ends with it. Default `/v1/traces`. */
  tracesPath?: string;
  /** Extra headers (auth, e.g. `{ "x-honeycomb-team": "…" }`). */
  headers?: Record<string, string>;
  /** `service.name` resource attribute. Default `"youneed"`. */
  serviceName?: string;
  /** Extra resource attributes (merged with `service.name`). */
  resourceAttributes?: Record<string, unknown>;
  /** Flush when this many spans are buffered. Default `100`. */
  batchSize?: number;
  /** Flush the buffer on this interval (ms) while running. Default `5000`. */
  flushMs?: number;
  /** Per-export request timeout (ms). Default `10000`. */
  timeoutMs?: number;
  /** Instrumentation scope name. Default `"@youneed/server-plugin-otlp"`. */
  scopeName?: string;
  /** Keep this many recently-exported spans for the devtools table. Default `50`. */
  recentLimit?: number;
  /** Injectable `fetch` (tests). Default the global `fetch`. */
  fetch?: typeof fetch;
}

/** A recently exported span, for the devtools table. */
export interface ExportedSpan {
  at: number;
  traceId: string;
  spanId: string;
  name: string;
  durationMs: number;
  error: boolean;
}

export interface OtlpStats {
  endpoint: string;
  queued: number;
  batches: number;
  exported: number;
  failed: number;
  lastError?: string;
  recent: ExportedSpan[];
}

/**
 * Batches finished {@link Span}s and ships them to an OTLP/HTTP collector.
 * `push(span)` from a `tracing({ onEnd })` hook; the buffer auto-flushes at
 * `batchSize` and on the `flushMs` timer (start it with {@link start}).
 */
export class OtlpExporter {
  readonly url: string;
  readonly #headers: Record<string, string>;
  readonly #resource: Record<string, unknown>;
  readonly #scope: { name: string };
  readonly #batchSize: number;
  readonly #flushMs: number;
  readonly #timeoutMs: number;
  readonly #recentLimit: number;
  readonly #fetch: typeof fetch;
  #buffer: Span[] = [];
  #timer: ReturnType<typeof setInterval> | undefined;
  #batches = 0;
  #exported = 0;
  #failed = 0;
  #lastError?: string;
  #recent: ExportedSpan[] = [];

  constructor(opts: OtlpOptions) {
    const base = opts.endpoint.replace(/\/$/, "");
    const path = opts.tracesPath ?? "/v1/traces";
    this.url = base.endsWith(path) ? base : base + path;
    this.#headers = { "content-type": "application/json", ...opts.headers };
    this.#resource = { "service.name": opts.serviceName ?? "youneed", ...opts.resourceAttributes };
    this.#scope = { name: opts.scopeName ?? "@youneed/server-plugin-otlp" };
    this.#batchSize = Math.max(1, opts.batchSize ?? 100);
    this.#flushMs = opts.flushMs ?? 5000;
    this.#timeoutMs = opts.timeoutMs ?? 10000;
    this.#recentLimit = opts.recentLimit ?? 50;
    this.#fetch = opts.fetch ?? globalThis.fetch;
  }

  /** Queue a finished span. Auto-flushes when the batch is full. */
  push = (span: Span): void => {
    this.#buffer.push(span);
    if (this.#buffer.length >= this.#batchSize) void this.flush();
  };

  /** Start the periodic flush timer (called by the plugin on listen). */
  start(): void {
    if (this.#timer || this.#flushMs <= 0) return;
    this.#timer = setInterval(() => void this.flush(), this.#flushMs);
    if (typeof this.#timer === "object" && "unref" in this.#timer) (this.#timer as { unref(): void }).unref();
  }

  /** Stop the timer and flush anything buffered. */
  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.flush();
  }

  /** Export the buffered spans now (no-op when empty). */
  async flush(): Promise<void> {
    if (this.#buffer.length === 0) return;
    const spans = this.#buffer;
    this.#buffer = [];
    const body = JSON.stringify(toOtlpTraces(spans, this.#resource, this.#scope));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const res = await this.#fetch(this.url, { method: "POST", headers: this.#headers, body, signal: controller.signal });
      this.#batches++;
      if (!res.ok) {
        this.#failed += spans.length;
        this.#lastError = `HTTP ${res.status}`;
      } else {
        this.#exported += spans.length;
        for (const s of spans) this.#remember(s);
      }
    } catch (e) {
      this.#failed += spans.length;
      this.#lastError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
  }

  #remember(s: Span): void {
    this.#recent.push({ at: Date.now(), traceId: s.traceId, spanId: s.spanId, name: s.name, durationMs: s.duration ?? 0, error: statusCode(s) === 2 });
    if (this.#recent.length > this.#recentLimit) this.#recent.shift();
  }

  stats(): OtlpStats {
    return {
      endpoint: this.url,
      queued: this.#buffer.length,
      batches: this.#batches,
      exported: this.#exported,
      failed: this.#failed,
      lastError: this.#lastError,
      recent: [...this.#recent],
    };
  }
}

/** Build an {@link OtlpExporter} (wire it to `tracing({ onEnd: exporter.push })`). */
export function otlpExporter(opts: OtlpOptions): OtlpExporter {
  return new OtlpExporter(opts);
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

export interface OtlpPluginOptions extends OtlpOptions {
  /** Internal route prefix (default `"/__otlp"`). */
  basePath?: string;
  /** Mount the devtools introspection routes (default true). */
  exposeDevtools?: boolean;
  /** Install `tracing({ onEnd })` for you (default true). Set false to wire it yourself. */
  installTracing?: boolean;
}

export interface OtlpInspect {
  kind: "otlp";
  endpoint: string;
  endpoints: { stats: string; flush: string };
}

/**
 * Mount OTLP trace export as a ServerPlugin: installs the tracing middleware,
 * batches spans, ships them on a timer + at shutdown, and exposes an `inspect()`
 * + routes for the devtools "OTLP" tab.
 */
export function otlp(opts: OtlpPluginOptions): ServerPlugin & { exporter: OtlpExporter } {
  const exporter = new OtlpExporter(opts);
  const basePath = (opts.basePath ?? "/__otlp").replace(/\/$/, "");
  const endpoints = { stats: `${basePath}/stats`, flush: `${basePath}/flush` };

  return {
    name: "otlp",
    exporter,
    setup(app) {
      if (opts.installTracing !== false) app.use(tracing({ onEnd: exporter.push }));
      if (opts.exposeDevtools === false) return;
      app.get(endpoints.stats, () => Response.json(exporter.stats()));
      app.post(endpoints.flush, async () => {
        await exporter.flush();
        return Response.json({ ok: true, ...exporter.stats() });
      });
    },
    onListen() {
      exporter.start();
    },
    async onShutdown() {
      await exporter.stop();
    },
    inspect(): OtlpInspect {
      return { kind: "otlp", endpoint: exporter.url, endpoints };
    },
  };
}
