// ── @youneed/server-plugin-otel — real OpenTelemetry SDK at the server level ─
//
// `@youneed/server-middleware-trace` + `@youneed/server-plugin-otlp` produce and
// export OpenTelemetry-SHAPED spans with zero dependencies. THIS package wires
// the REAL OpenTelemetry SDK (through the shared `@youneed/otel` core — the only
// place `@opentelemetry/*` is imported) into `@youneed/server`: one SERVER span
// per request with W3C `traceparent` extraction (an incoming trace continues
// here), `http.server.*` metrics, and OTLP/HTTP export. Downstream
// `withSpanAsync` / `instrumentedFetch` calls nest under the request span
// automatically — the span is active for the whole pipeline.
//
//   app.plugin(otel({ serviceName: "api", endpoint: "http://localhost:4318" }));
//   // → exported SERVER spans + http.server.request.duration / .active_requests
//
// Middleware-only (SDK started elsewhere — custom bootstrap, tests):
//
//   app.use(otelMiddleware());            // global OTel providers
//   app.use(otelMiddleware({ handle }));  // this handle's tracer + meter
//
// Log correlation: the middleware stores `{ traceId, spanId, otel }` at
// `ctx.state.span` — the same bag `@youneed/server-middleware-logger` and
// `-request-logger` read structurally, so their lines keep carrying `traceId`.
//
// Provider form for controllers — a typed `this.otel` (child spans + global
// metrics + the current request's traceId/spanId):
//
//   class Users extends Controller("/users", { providers: [otelProvider()] }) {
//     @Controller.get("/:id") one() { return this.otel.spanAsync("load", () => …); }
//   }
import {
  createOtelApi,
  extractHeaders,
  getMeter,
  getTracer,
  recordException,
  resolveConfig,
  setSpanOnContext,
  SpanKind,
  SpanStatusCode,
  withContext,
} from "@youneed/otel";
import type { Histogram, Meter, OtelApi, OtelHandle, Span, Tracer } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";
import type { NodeOtelConfig } from "@youneed/otel/node";
import { context, HttpError, isResult } from "@youneed/server";
import type { ControllerProvider, HttpResponse, Middleware, ServerPlugin } from "@youneed/server";

// Semantic-convention attribute names (plain strings — the constants are not
// re-exported from `@youneed/otel`).
const ATTR_METHOD = "http.request.method";
const ATTR_PATH = "url.path";
const ATTR_STATUS = "http.response.status_code";

/** What {@link otelMiddleware} stores at `ctx.state.span`: the correlation ids
 *  the logger middlewares read, plus the live OTel span for handlers. */
export interface OtelSpanFacade {
  /** 16-byte trace id as 32 lowercase hex chars — shared across the whole trace. */
  readonly traceId: string;
  /** 8-byte span id as 16 lowercase hex chars — unique to this request span. */
  readonly spanId: string;
  /** The real OTel SERVER span — `setAttribute`/`addEvent`/`recordException` on it. */
  readonly otel: Span;
}

export interface OtelMiddlewareOptions {
  /** Handle from `startNodeOtel` — its tracer + meter are used. */
  handle?: OtelHandle;
  /** Tracer override (wins over `handle.tracer`). */
  tracer?: Tracer;
}

/** Response status the way the framework computes it — mirrors
 *  `@youneed/server-middleware-request-logger` (results are serialized after the
 *  middleware chain unwinds, so the status lives on the RETURNED descriptor). */
function statusOf(result: unknown, res: HttpResponse): number {
  if (isResult(result)) return result.status;
  if (res.headersSent) return res.statusCode;
  return result === undefined || result === null ? 204 : 200;
}

// Instruments are per-Meter singletons: creating the same instrument twice from
// one meter makes the SDK warn, and middleware factories may share a meter.
interface ServerInstruments {
  duration: Histogram;
  active: ReturnType<Meter["createUpDownCounter"]>;
}
const instrumentCache = new WeakMap<Meter, ServerInstruments>();

function instruments(meter: Meter): ServerInstruments {
  let found = instrumentCache.get(meter);
  if (!found) {
    found = {
      duration: meter.createHistogram("http.server.request.duration", {
        unit: "s",
        description: "Duration of HTTP server requests.",
      }),
      active: meter.createUpDownCounter("http.server.active_requests", {
        description: "Number of in-flight HTTP server requests.",
      }),
    };
    instrumentCache.set(meter, found);
  }
  return found;
}

/**
 * One SERVER span per request: continues an incoming `traceparent`, runs the
 * rest of the pipeline with the span active, records `http.server.*` metrics.
 * Register early so it wraps routing (404s included). Without `opts` the global
 * OTel providers are used, so it also works when the SDK was started elsewhere.
 *
 * Errors: a throw records an exception event + ERROR status and is rethrown
 * (the framework turns it into a response); a non-thrown 5xx result sets ERROR
 * without an exception event.
 */
export function otelMiddleware(opts: OtelMiddlewareOptions = {}): Middleware {
  const tracer = opts.tracer ?? opts.handle?.tracer ?? getTracer();
  const { duration, active } = instruments(opts.handle?.meter ?? getMeter());

  return async (ctx, next) => {
    const method = ctx.request.method ?? "GET";
    const rawUrl = ctx.request.url ?? "/";
    const q = rawUrl.indexOf("?");
    const path = q === -1 ? rawUrl : rawUrl.slice(0, q); // low cardinality

    // Remote parent from inbound headers — an incoming trace id continues here.
    const parentCtx = extractHeaders(ctx.request.headers);
    const span = tracer.startSpan(
      method, // provisional; finalized below once the request ran
      { kind: SpanKind.SERVER, attributes: { [ATTR_METHOD]: method, [ATTR_PATH]: path } },
      parentCtx,
    );

    const sc = span.spanContext();
    const facade: OtelSpanFacade = { traceId: sc.traceId, spanId: sc.spanId, otel: span };
    ctx.state.span = facade;

    const started = performance.now();
    active.add(1, { [ATTR_METHOD]: method });
    let status = 500;
    try {
      const result = await withContext(setSpanOnContext(parentCtx, span), () => next());
      status = statusOf(result, ctx.response);
      span.setAttribute(ATTR_STATUS, status);
      if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
      return result;
    } catch (err) {
      recordException(span, err);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      status = err instanceof HttpError ? err.status : 500;
      span.setAttribute(ATTR_STATUS, status);
      throw err;
    } finally {
      span.updateName(`${method} ${path}`);
      active.add(-1, { [ATTR_METHOD]: method });
      duration.record((performance.now() - started) / 1000, {
        [ATTR_METHOD]: method,
        [ATTR_STATUS]: status,
      });
      span.end();
    }
  };
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

export interface ServerOtelOptions extends NodeOtelConfig {
  /** Inject an existing handle (SDK started elsewhere — tests, custom
   *  bootstrap). The plugin then never flushes/shuts it down. */
  handle?: OtelHandle;
  /** Install {@link otelMiddleware} in `setup` (default true). */
  installMiddleware?: boolean;
}

export interface OtelInspect {
  kind: "otel";
  endpoint: string;
}

/**
 * OpenTelemetry as a ServerPlugin: starts the Node SDK (`startNodeOtel`) unless
 * a `handle` is injected, installs the request middleware, and flushes + shuts
 * the SDK down with the server (only when the plugin owns the handle).
 */
export function otel(opts: ServerOtelOptions = {}): ServerPlugin & { handle: OtelHandle } {
  const endpoint = resolveConfig(opts).endpoint;
  const owned = opts.handle === undefined;

  const plugin: ServerPlugin & { handle: OtelHandle } = {
    name: "otel",
    // Assigned for real in setup(); set early only when injected via opts.
    handle: opts.handle as OtelHandle,
    setup(app) {
      plugin.handle = opts.handle ?? startNodeOtel(opts);
      if (opts.installMiddleware !== false) app.use(otelMiddleware({ handle: plugin.handle }));
    },
    async onShutdown() {
      if (!owned || !plugin.handle) return; // injected handle: caller's lifecycle
      await plugin.handle.forceFlush();
      await plugin.handle.shutdown();
    },
    inspect(): OtelInspect {
      return { kind: "otel", endpoint };
    },
  };
  return plugin;
}

// ── ControllerProvider ──────────────────────────────────────────────────────

/** The api {@link otelProvider} exposes as `this.<key>` (default `this.otel`):
 *  the shared {@link OtelApi} (child spans, global metrics) plus the current
 *  request's correlation ids. */
export interface ServerOtelApi extends OtelApi {
  /** Trace id of the current request's SERVER span (undefined outside a request / without the otel middleware). */
  readonly traceId?: string;
  /** Span id of the current request's SERVER span. */
  readonly spanId?: string;
}

/** Options for {@link otelProvider}. */
export interface OtelProviderOptions {
  /** Handle from `startNodeOtel` — its tracer is used for child spans. */
  handle?: OtelHandle;
  /** Instance member the api is exposed under (default `"otel"`). */
  key?: string;
}

/**
 * A {@link ControllerProvider} that injects a {@link ServerOtelApi} as
 * `this.<key>` (default `this.otel`) — the provider form of this package's
 * integration, mirroring `@youneed/server-middleware-logger`'s
 * `loggerProvider`:
 *
 *   class Users extends Controller("/users", { providers: [otelProvider()] }) {
 *     @Controller.get("/:id")
 *     one() {
 *       // child of the request's SERVER span; this.otel.traceId correlates logs
 *       return this.otel.spanAsync("load-user", async (span) => { … });
 *     }
 *   }
 *
 * `traceId`/`spanId` are resolved PER ACCESS from the ambient request
 * (`context()`) — the facade {@link otelMiddleware} stores at `ctx.state.span`
 * (read structurally, so a missing facade is tolerated) — which lets one
 * memoized api object serve every request. Outside a request (a WebSocket
 * JSON-RPC frame, startup code) both are `undefined` while `span`/`spanAsync`
 * and the global `counter`/`histogram` keep working. Without `opts.handle` the
 * global tracer is used, so it also works when the SDK was started elsewhere.
 */
export function otelProvider(opts: OtelProviderOptions = {}): ControllerProvider<{ otel: ServerOtelApi }> {
  const key = opts.key ?? "otel";
  return {
    install(instance: object) {
      // One base api per install; the traceId/spanId getters below do the
      // per-request work, so the instance getter can return the same object.
      const base = createOtelApi({ tracer: opts.handle?.tracer ?? getTracer() });
      const api: ServerOtelApi = {
        ...base,
        get traceId() {
          return (context()?.state.span as OtelSpanFacade | undefined)?.traceId;
        },
        get spanId() {
          return (context()?.state.span as OtelSpanFacade | undefined)?.spanId;
        },
      };
      Object.defineProperty(instance, key, {
        get: () => api,
        enumerable: false,
        configurable: true,
      });
    },
    __contributes: undefined as unknown as { otel: ServerOtelApi },
  };
}
