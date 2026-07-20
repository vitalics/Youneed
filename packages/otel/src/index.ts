// ── @youneed/otel — shared OpenTelemetry setup for all @youneed/* levels ─────
//
// One dependency-owned home for the real OpenTelemetry SDK: config resolution
// (env-aware), tracer/meter access, span helpers, W3C `traceparent` propagation
// and an instrumented `fetch`. Environment-specific SDK wiring lives in the
// subpath entries:
//
//   import { startNodeOtel } from "@youneed/otel/node";   // Node: server, cli, test
//   import { startWebOtel } from "@youneed/otel/web";     // browser: dom
//
// Level packages (`server-plugin-otel`, `cli-plugin-otel`, `dom-provider-otel`,
// `test-plugin-otel`, `logger-plugin-otel`) depend only on THIS package — they
// never import `@opentelemetry/*` directly.
//
// Standard env vars are honored as defaults: OTEL_SDK_DISABLED,
// OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS.

import { context, metrics, propagation, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type {
  Attributes,
  Context,
  Counter,
  Histogram,
  Meter,
  Span,
  SpanContext,
  TextMapGetter,
  TextMapSetter,
  Tracer,
} from "@opentelemetry/api";
import { defaultResource, resourceFromAttributes, type Resource } from "@opentelemetry/resources";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_FULL,
} from "@opentelemetry/semantic-conventions";

export { SpanKind, SpanStatusCode } from "@opentelemetry/api";
export type { Attributes, Context, Counter, Histogram, Meter, Span, SpanContext, Tracer } from "@opentelemetry/api";

// ── Config ───────────────────────────────────────────────────────────────────

/** Shared config for every level. `endpoint` is the OTLP/HTTP base (`/v1/traces` and `/v1/metrics` are appended). */
export interface OtelConfig {
  /** `service.name` resource attribute. Falls back to OTEL_SERVICE_NAME, then "youneed". */
  serviceName?: string;
  /** `service.version` resource attribute. */
  serviceVersion?: string;
  /** OTLP/HTTP base endpoint, e.g. "http://localhost:4318". Falls back to OTEL_EXPORTER_OTLP_ENDPOINT. */
  endpoint?: string;
  /** Extra headers for exporter requests (auth tokens…). Falls back to OTEL_EXPORTER_OTLP_HEADERS (`k=v,k2=v2`). */
  headers?: Record<string, string>;
  /** Extra resource attributes merged over the defaults. */
  resourceAttributes?: Record<string, string>;
  /** Master switch for trace export. Default true. */
  traces?: boolean;
  /** Master switch for metric export. Default true. */
  metrics?: boolean;
  /** Root sampling ratio 0..1 (parent-based). Default 1 — keep everything. */
  sampleRatio?: number;
  /** Periodic metric export interval. Default 60000. */
  metricExportIntervalMs?: number;
  /** Whole-SDK kill switch. Default: true unless OTEL_SDK_DISABLED=true. */
  enabled?: boolean;
}

export interface ResolvedOtelConfig {
  serviceName: string;
  serviceVersion?: string;
  endpoint: string;
  headers?: Record<string, string>;
  resourceAttributes: Record<string, string>;
  traces: boolean;
  metrics: boolean;
  sampleRatio: number;
  metricExportIntervalMs: number;
  enabled: boolean;
}

/** Read an env var when a process-like global exists (browser-safe). */
function env(key: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

/** Parse OTEL_EXPORTER_OTLP_HEADERS ("k=v,k2=v2"). */
function parseHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Merge user config over OTEL_* env vars over defaults. */
export function resolveConfig(config: OtelConfig = {}): ResolvedOtelConfig {
  const endpoint = (config.endpoint ?? env("OTEL_EXPORTER_OTLP_ENDPOINT") ?? "http://localhost:4318").replace(/\/+$/, "");
  return {
    serviceName: config.serviceName ?? env("OTEL_SERVICE_NAME") ?? "youneed",
    serviceVersion: config.serviceVersion ?? env("OTEL_SERVICE_VERSION"),
    endpoint,
    headers: config.headers ?? parseHeaders(env("OTEL_EXPORTER_OTLP_HEADERS")),
    resourceAttributes: config.resourceAttributes ?? {},
    traces: config.traces ?? true,
    metrics: config.metrics ?? true,
    sampleRatio: config.sampleRatio ?? 1,
    metricExportIntervalMs: config.metricExportIntervalMs ?? 60_000,
    enabled: config.enabled ?? env("OTEL_SDK_DISABLED") !== "true",
  };
}

// ── Handle ───────────────────────────────────────────────────────────────────

/** What `startNodeOtel` / `startWebOtel` return: live tracer/meter + lifecycle. */
export interface OtelHandle {
  readonly enabled: boolean;
  readonly tracer: Tracer;
  readonly meter: Meter;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Default instrumentation scope for helpers in this package. */
export const OTEL_SCOPE = "@youneed/otel";

/** Build the OTel Resource (service.name/version + extras) shared by traces and metrics. */
export function buildResource(config: OtelConfig = {}): Resource {
  const cfg = resolveConfig(config);
  return defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: cfg.serviceName,
      ...(cfg.serviceVersion ? { [ATTR_SERVICE_VERSION]: cfg.serviceVersion } : {}),
      ...cfg.resourceAttributes,
    }),
  );
}

export function getTracer(scope: string = OTEL_SCOPE): Tracer {
  return trace.getTracer(scope);
}

export function getMeter(scope: string = OTEL_SCOPE): Meter {
  return metrics.getMeter(scope);
}

/** Handle used when the SDK is disabled — everything is a pass-through no-op. */
export function noopHandle(): OtelHandle {
  return {
    enabled: false,
    tracer: getTracer(),
    meter: getMeter(),
    forceFlush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  };
}

// ── Global metrics ───────────────────────────────────────────────────────────

export interface GlobalMetricOptions {
  /** Instrumentation scope (meter name). Default: {@link OTEL_SCOPE}. */
  scope?: string;
  description?: string;
  unit?: string;
}

// Set by startNodeOtel/startWebOtel once a real MeterProvider is registered.
// Unlike the trace api, the metrics api does NOT late-bind instruments created
// before provider registration (they stay Noop) — so global instruments are
// created lazily, on first use AFTER this flag flips. Measurements taken
// before the SDK starts are dropped silently (same as any no-op meter).
let metricsBound = false;

/** Internal: called by `startNodeOtel`/`startWebOtel` after registering the global MeterProvider. */
export function __bindGlobalMetrics(): void {
  metricsBound = true;
}

const globalInstruments = new Map<string, Counter | Histogram>();

/**
 * Process-wide shared counter: the same (scope, name, unit) always yields the
 * SAME instrument — created once, reused by app code, middleware and every test
 * in the run. E.g. one `useGlobalCounter("url_calls")` at the top of a test file
 * is shared by all tests instead of being re-created per test.
 *
 * The real OTEL instrument is created lazily on first use after the SDK starts
 * (the metrics api has no late binding), so declaring it at module top is safe;
 * before `startNodeOtel`/`startWebOtel` it is a silent no-op.
 */
export function useGlobalCounter(name: string, opts: GlobalMetricOptions = {}): Counter {
  const scope = opts.scope ?? OTEL_SCOPE;
  const key = `${scope}\ncounter\n${name}\n${opts.unit ?? ""}`;
  let inst = globalInstruments.get(key);
  if (!inst) {
    let real: Counter | undefined;
    inst = {
      add(value: number, attributes?: Attributes, context?: Context): void {
        if (!real && metricsBound) real = getMeter(scope).createCounter(name, { description: opts.description, unit: opts.unit });
        real?.add(value, attributes, context);
      },
    };
    globalInstruments.set(key, inst);
  }
  return inst as Counter;
}

/** Process-wide shared histogram — same caching/lazy semantics as {@link useGlobalCounter}. */
export function useGlobalHistogram(name: string, opts: GlobalMetricOptions = {}): Histogram {
  const scope = opts.scope ?? OTEL_SCOPE;
  const key = `${scope}\nhistogram\n${name}\n${opts.unit ?? ""}`;
  let inst = globalInstruments.get(key);
  if (!inst) {
    let real: Histogram | undefined;
    inst = {
      record(value: number, attributes?: Attributes, context?: Context): void {
        if (!real && metricsBound) real = getMeter(scope).createHistogram(name, { description: opts.description, unit: opts.unit });
        real?.record(value, attributes, context);
      },
    };
    globalInstruments.set(key, inst);
  }
  return inst as Histogram;
}

// ── Contributed API (`this.otel` for providers / fixtures / middleware) ─────

/**
 * The shared surface every level contributes as `this.otel` (server
 * `otelProvider`, dom `otelProvider`, cli `otelCommand`, test `OtelFixture`):
 * child spans (nested under the level's active span via the OTel context) and
 * the process-wide global metrics.
 */
export interface OtelApi {
  readonly tracer: Tracer;
  /** Sync child span around `fn` — see {@link withSpan}. */
  span<T>(name: string, fn: (span: Span) => T, opts?: WithSpanOptions): T;
  /** Async child span around `fn` — see {@link withSpanAsync}. */
  spanAsync<T>(name: string, fn: (span: Span) => T | Promise<T>, opts?: WithSpanOptions): Promise<T>;
  /** {@link useGlobalCounter} — the same process-wide metric from any level. */
  counter(name: string, opts?: GlobalMetricOptions): Counter;
  /** {@link useGlobalHistogram} — the same process-wide metric from any level. */
  histogram(name: string, opts?: GlobalMetricOptions): Histogram;
}

/** Build the contributed {@link OtelApi} bound to a tracer (default: the global one). */
export function createOtelApi(opts: { tracer?: Tracer } = {}): OtelApi {
  const tracer = opts.tracer ?? getTracer();
  return {
    tracer,
    span: (name, fn, spanOpts) => withSpan(name, {}, fn, { ...spanOpts, tracer: spanOpts?.tracer ?? tracer }),
    spanAsync: (name, fn, spanOpts) => withSpanAsync(name, {}, fn, { ...spanOpts, tracer: spanOpts?.tracer ?? tracer }),
    counter: (name, metricOpts) => useGlobalCounter(name, metricOpts),
    histogram: (name, metricOpts) => useGlobalHistogram(name, metricOpts),
  };
}

// ── Span helpers ─────────────────────────────────────────────────────────────

export interface WithSpanOptions {
  tracer?: Tracer;
  kind?: SpanKind;
}

/** `span.recordException` that tolerates non-Error throws. */
export function recordException(span: Span, err: unknown): void {
  span.recordException(err instanceof Error ? err : String(err));
}

function failSpan(span: Span, err: unknown): void {
  recordException(span, err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
}

/**
 * Run `fn` inside an active span. Thrown errors are recorded (exception event +
 * ERROR status) and rethrown; the span always ends. For sync work use `withSpan`.
 */
export async function withSpanAsync<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => T | Promise<T>,
  opts: WithSpanOptions = {},
): Promise<T> {
  const tracer = opts.tracer ?? getTracer();
  return tracer.startActiveSpan(name, { kind: opts.kind ?? SpanKind.INTERNAL, attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      failSpan(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Sync variant of `withSpanAsync` — do NOT return a promise from `fn` here. */
export function withSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => T, opts: WithSpanOptions = {}): T {
  const tracer = opts.tracer ?? getTracer();
  return tracer.startActiveSpan(name, { kind: opts.kind ?? SpanKind.INTERNAL, attributes }, (span) => {
    try {
      return fn(span);
    } catch (err) {
      failSpan(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** SpanContext of the currently active span, if any. */
export function activeSpanContext(): SpanContext | undefined {
  return trace.getActiveSpan()?.spanContext();
}

/** True when the context has a valid (non-zero, valid-format) trace id. */
export function isValidSpanContext(sc: SpanContext | undefined): sc is SpanContext {
  return !!sc && trace.isSpanContextValid(sc);
}

/** `trace.setSpan(ctx, span)` without importing the api namespace. */
export function setSpanOnContext(ctx: Context, span: Span): Context {
  return trace.setSpan(ctx, span);
}

/** Run `fn` with `ctx` as the active OTel context (nests child spans). */
export function withContext<T>(ctx: Context, fn: () => T): T {
  return context.with(ctx, fn);
}

// ── W3C propagation ──────────────────────────────────────────────────────────

const recordSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value;
  },
};

/** Inject `traceparent`/`tracestate`/`baggage` of the active context into a plain header record. */
export function injectHeaders(headers: Record<string, string> = {}, ctx: Context = context.active()): Record<string, string> {
  propagation.inject(ctx, headers, recordSetter);
  return headers;
}

const lowercaseGetter: TextMapGetter<Record<string, string>> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => carrier[key.toLowerCase()],
};

/**
 * Extract a remote parent context from inbound headers (any casing, first value
 * of arrays wins). Returns a context to use as the parent of a SERVER span.
 */
export function extractHeaders(headers: Record<string, unknown>, ctx: Context = context.active()): Context {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") normalized[key.toLowerCase()] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") normalized[key.toLowerCase()] = value[0];
  }
  return propagation.extract(ctx, normalized, lowercaseGetter);
}

// ── Instrumented fetch (client spans + propagation) ─────────────────────────

export interface InstrumentedFetchOptions {
  /** Fetch implementation to wrap. Defaults to the global one. */
  base?: typeof fetch;
  tracer?: Tracer;
  /** Custom span name. Default: `HTTP <METHOD>`. */
  spanName?: (info: { method: string; url: string }) => string;
}

const headersSetter: TextMapSetter<Headers> = {
  set(carrier, key, value) {
    carrier.set(key, value);
  },
};

/**
 * Wrap a `fetch` so every call becomes a CLIENT span with `traceparent`
 * injected — the glue for `@youneed/http-client` (`createClient({ fetch:
 * instrumentedFetch() })`) and for browser code behind `dom-provider-otel`.
 */
export function instrumentedFetch(opts: InstrumentedFetchOptions = {}): typeof fetch {
  const base = opts.base ?? globalThis.fetch;
  if (!base) throw new Error("instrumentedFetch: no global fetch — pass opts.base");
  const hasRequest = typeof Request !== "undefined";

  return async function otelFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (hasRequest && input instanceof Request ? input.method : "GET")).toUpperCase();
    let host = "";
    try {
      host = new URL(url, typeof location !== "undefined" ? location.href : undefined).host;
    } catch {
      /* relative url without location — skip server.address */
    }

    const attributes: Attributes = {
      [ATTR_HTTP_REQUEST_METHOD]: method,
      [ATTR_URL_FULL]: url,
    };
    if (host) attributes[ATTR_SERVER_ADDRESS] = host;

    return withSpanAsync(
      opts.spanName?.({ method, url }) ?? `HTTP ${method}`,
      attributes,
      async (span) => {
        const headers = new Headers(hasRequest && input instanceof Request ? input.headers : undefined);
        if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        propagation.inject(context.active(), headers, headersSetter);

        const res = await base(input as never, { ...init, headers });
        span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.status);
        if (res.status >= 400) span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.status}` });
        return res;
      },
      { kind: SpanKind.CLIENT, tracer: opts.tracer },
    );
  };
}
