// ── @youneed/ssr-plugin-otel — real OpenTelemetry for SSR page renders ──────
//
// An {@link SsrModule} for `@youneed/server-plugin-ssr`: one INTERNAL
// `ssr.render <url>` span per rendered static page, plus `ssr.render.count` /
// `ssr.render.duration` metrics. Like every `@youneed/*-otel` level package it
// depends only on the shared `@youneed/otel` core — never `@opentelemetry/*`.
//
//   import { Application } from "@youneed/server";
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { otelModule } from "@youneed/ssr-plugin-otel";
//
//   Application()
//     .plugin(ssr({ pages: [Home, About], modules: [otelModule()] }))
//     .listen(3000, () => {});
//
// This module only USES a tracer/meter (an injected `handle`, else the global
// providers) — it never starts the SDK. SDK lifecycle belongs to the app,
// typically `@youneed/server-plugin-otel`:
//
//   Application()
//     .plugin(otel({ serviceName: "site" }))                 // starts the SDK
//     .plugin(ssr({ pages, modules: [otelModule()] }));      // uses its providers
//
// Composition: when the server-level `otel()` middleware is also installed, its
// SERVER span is active around the pipeline, so `ssr.render` nests under it via
// the OTel context (list that plugin FIRST so its `use()` runs outside). Without
// it, `ssr.render` spans are trace roots — both are fine.
//
// Limitation: only STATIC page routes are traced. The module context exposes no
// URL patterns for dynamic pages (`/users/:id`), so their renders pass through
// untraced rather than emitting high-cardinality span names.
import {
  extractHeaders,
  getMeter,
  getTracer,
  recordException,
  setSpanOnContext,
  SpanKind,
  SpanStatusCode,
  withContext,
} from "@youneed/otel";
import type { Counter, Histogram, Meter, OtelHandle, Tracer } from "@youneed/otel";
import { HttpError, isResult } from "@youneed/server";
import type { HttpResponse, Middleware } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

// Semantic-convention attribute names (plain strings — the constants are not
// re-exported from `@youneed/otel`).
const ATTR_ROUTE = "ssr.route";
const ATTR_STATUS = "http.response.status_code";

export interface SsrOtelModuleOptions {
  /** Handle from `startNodeOtel` — its tracer + meter are used (tests, custom
   *  bootstrap). Default: the global OTel providers. */
  handle?: OtelHandle;
}

/** Response status the way the framework computes it — mirrors
 *  `@youneed/server-plugin-otel` (results are serialized after the middleware
 *  chain unwinds, so the status lives on the RETURNED descriptor). */
function statusOf(result: unknown, res: HttpResponse): number {
  if (isResult(result)) return result.status;
  if (res.headersSent) return res.statusCode;
  return result === undefined || result === null ? 204 : 200;
}

/** Strip query string / fragment (mirrors server-middleware-metrics' pathOf). */
function pathOf(url: string | undefined): string {
  if (!url) return "/";
  const q = url.indexOf("?");
  const h = url.indexOf("#");
  let end = url.length;
  if (q !== -1) end = Math.min(end, q);
  if (h !== -1) end = Math.min(end, h);
  return url.slice(0, end);
}

// Instruments are per-Meter singletons: creating the same instrument twice from
// one meter makes the SDK warn, and module factories may share a meter.
interface SsrInstruments {
  count: Counter;
  duration: Histogram;
}
const instrumentCache = new WeakMap<Meter, SsrInstruments>();

function instruments(meter: Meter): SsrInstruments {
  let found = instrumentCache.get(meter);
  if (!found) {
    found = {
      count: meter.createCounter("ssr.render.count", {
        description: "Number of SSR page renders.",
      }),
      duration: meter.createHistogram("ssr.render.duration", {
        unit: "ms",
        description: "Duration of SSR page renders.",
      }),
    };
    instrumentCache.set(meter, found);
  }
  return found;
}

export interface SsrOtelInspect {
  kind: "otel";
  /** Number of static page routes the middleware traces. */
  routes: number;
}

/**
 * OpenTelemetry as an {@link SsrModule}: a global middleware that traces + times
 * GETs of the discovered static page routes. The tracer/meter resolve in
 * `setup` (not at factory time), so with no `handle` the GLOBAL providers are
 * read after an earlier-listed `@youneed/server-plugin-otel` has started the
 * SDK — and instruments never bind to a pre-SDK no-op meter.
 *
 * Errors: a throwing render records an exception event + ERROR status and is
 * rethrown (the framework turns it into a 500); the span always ends and the
 * metrics always record.
 */
export function otelModule(opts: SsrOtelModuleOptions = {}): SsrModule {
  const pages = new Set<string>();

  return {
    name: "otel",
    setup(ctx: SsrModuleContext) {
      // ctx.routes is documented static-only; filter defensively anyway.
      for (const route of ctx.routes) if (!route.dynamic) pages.add(route.url);

      const tracer: Tracer = opts.handle?.tracer ?? getTracer();
      const { count, duration } = instruments(opts.handle?.meter ?? getMeter());

      // A global middleware wraps every request — including the page routes the
      // host plugin mounted BEFORE this setup ran.
      const mw: Middleware = async (ctx, next) => {
        const method = (ctx.request.method ?? "GET").toUpperCase();
        const path = pathOf(ctx.request.url);
        if (method !== "GET" || !pages.has(path)) return next();

        const span = tracer.startSpan(`ssr.render ${path}`, {
          kind: SpanKind.INTERNAL,
          attributes: { [ATTR_ROUTE]: path },
        });
        const started = performance.now();
        let status = 500;
        try {
          // extractHeaders({}) is the active context unchanged (nothing to
          // extract) — a server-plugin-otel SERVER span becomes the parent
          // when that middleware is installed; without it the span is a root.
          const result = await withContext(setSpanOnContext(extractHeaders({}), span), () => next());
          status = statusOf(result, ctx.response);
          return result;
        } catch (err) {
          recordException(span, err);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          status = err instanceof HttpError ? err.status : 500;
          throw err;
        } finally {
          span.setAttribute(ATTR_STATUS, status);
          const attrs = { route: path, status };
          count.add(1, attrs);
          duration.record(performance.now() - started, attrs);
          span.end();
        }
      };
      ctx.app.use(mw);
    },
    inspect(): SsrOtelInspect {
      return { kind: "otel", routes: pages.size };
    },
  };
}
