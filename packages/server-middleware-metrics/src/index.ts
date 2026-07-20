// @youneed/server middleware — record Prometheus metrics for every request and
// expose them at `GET /metrics` in the text exposition format. Dependency-free:
// no `prom-client`, the registry and the wire format are built by hand.
//
//   app.use(metrics())                       // GET /metrics → text exposition
//      .get("/users", () => Response.json([]));
//
//   // → http_requests_total{method="GET",status="200"} 1
//   //   http_request_duration_seconds_bucket{method="GET",status="200",le="0.05"} 1
//   //   http_request_duration_seconds_sum{method="GET",status="200"} 0.0012
//   //   http_requests_in_flight 0
//
// Custom process-wide metrics ride along in the same exposition:
//
//   const urlCalls = useGlobalCounter("url_calls");      // shared by ALL callers
//   urlCalls.inc({ route: "/users" });                    // → url_calls{route="/users"} 1
//   useGlobalHistogram("job_seconds").observe(0.42);      // → job_seconds_bucket/sum/count
//
// Cardinality discipline: series are labeled by `method` + `status` only — never
// by raw URL/path (unbounded). An optional low-cardinality `route(ctx)` label is
// off by default; only enable it with a bounded set of values (a route template).
// The same discipline applies to labels you put on global metrics.
import type { Context, Middleware } from "@youneed/server";
import { Response } from "@youneed/server";

/** Default histogram buckets (seconds) — the prom-client defaults. */
export const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

export interface MetricsOptions {
  /** Path that serves the exposition (default `"/metrics"`, matched on GET). */
  path?: string;
  /** Histogram buckets in seconds (default {@link DEFAULT_BUCKETS}). */
  buckets?: readonly number[];
  /** Metric-name prefix, e.g. `"myapp_"` → `myapp_http_requests_total`. */
  prefix?: string;
  /** Optional LOW-cardinality route label (e.g. a route template). Off by default —
   *  only return a bounded set of values, never the raw URL. */
  route?: (ctx: Context) => string;
}

/** A counter/histogram series keyed by its sorted label set. */
interface Series {
  labels: Record<string, string>;
  count: number; // observations (counter value, or histogram _count)
  sum: number; // histogram _sum (seconds); unused for the plain counter
  bucketCounts: number[]; // per-bucket cumulative-eligible counts (aligned to buckets)
}

const METHOD_RE = /[\n"\\]/; // chars we escape in label values

/** Escape a Prometheus label value: backslash, double-quote, newline. */
function escapeLabel(value: string): string {
  if (!METHOD_RE.test(value)) return value;
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

/** Render a `{a="x",b="y"}` label block (empty string when no labels). */
function renderLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return "";
  const parts = keys.map((k) => `${k}="${escapeLabel(labels[k])}"`);
  return `{${parts.join(",")}}`;
}

/** A stable key for a label set, so repeated requests aggregate into one series. */
function labelKey(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
}

/** Aggregate one observation into a series map (counter value or histogram facets). */
function observeSeries(series: Map<string, Series>, buckets: readonly number[], labels: Record<string, string>, value: number): void {
  const key = labelKey(labels);
  let s = series.get(key);
  if (!s) {
    s = { labels, count: 0, sum: 0, bucketCounts: buckets.map(() => 0) };
    series.set(key, s);
  }
  s.count += 1;
  s.sum += value;
  // Per-bucket (non-cumulative) storage — the renderer re-cumulates. Sorted
  // buckets, so the first matching bucket owns the observation.
  for (let i = 0; i < buckets.length; i++) {
    if (value <= buckets[i]) {
      s.bucketCounts[i] += 1;
      break;
    }
  }
}

/** Render HELP/TYPE + `_bucket`/`_sum`/`_count` lines for a histogram series map. */
function renderHistogramSeries(out: string[], name: string, help: string, buckets: readonly number[], series: Map<string, Series>): void {
  out.push(`# HELP ${name} ${help}`);
  out.push(`# TYPE ${name} histogram`);
  for (const s of series.values()) {
    let cumulative = 0;
    for (let i = 0; i < buckets.length; i++) {
      cumulative += s.bucketCounts[i];
      const labels = { ...s.labels, le: formatLe(buckets[i]) };
      out.push(`${name}_bucket${renderLabels(labels)} ${cumulative}`);
    }
    // The +Inf bucket always equals the total observation count.
    out.push(`${name}_bucket${renderLabels({ ...s.labels, le: "+Inf" })} ${s.count}`);
    out.push(`${name}_sum${renderLabels(s.labels)} ${s.sum}`);
    out.push(`${name}_count${renderLabels(s.labels)} ${s.count}`);
  }
}

// ── Global custom metrics ────────────────────────────────────────────────────
// Process-wide registry of user metrics, rendered by every `metrics()` exposition.
// One `useGlobalCounter("url_calls")` handle is shared by all callers/tests —
// instruments are created once per (kind, name) and live for the process.

export interface GlobalCounterOptions {
  /** HELP line text (default: generated from the name). */
  help?: string;
}

export interface GlobalHistogramOptions {
  help?: string;
  /** Buckets in the histogram's native unit (default {@link DEFAULT_BUCKETS}). */
  buckets?: readonly number[];
}

/** A shared Prometheus counter handle. */
export interface PromCounter {
  readonly name: string;
  /** Increment by `value` (default 1), optionally under a label set. */
  inc(labels?: Record<string, string>, value?: number): void;
}

/** A shared Prometheus histogram handle. */
export interface PromHistogram {
  readonly name: string;
  /** Record one observation, optionally under a label set. */
  observe(value: number, labels?: Record<string, string>): void;
}

interface GlobalCounterState {
  kind: "counter";
  name: string;
  help: string;
  series: Map<string, { labels: Record<string, string>; value: number }>;
}

interface GlobalHistogramState {
  kind: "histogram";
  name: string;
  help: string;
  buckets: readonly number[];
  series: Map<string, Series>;
}

const globalMetrics = new Map<string, GlobalCounterState | GlobalHistogramState>();

/**
 * Process-wide shared counter, included in every `metrics()` exposition.
 * The same `name` always yields the same underlying series, so a metric like
 * `url_calls` can be incremented from any middleware, handler or test.
 */
export function useGlobalCounter(name: string, opts: GlobalCounterOptions = {}): PromCounter {
  const key = `counter\n${name}`;
  let state = globalMetrics.get(key) as GlobalCounterState | undefined;
  if (!state) {
    state = { kind: "counter", name, help: opts.help ?? `Custom global counter ${name}.`, series: new Map() };
    globalMetrics.set(key, state);
  }
  return {
    name,
    inc(labels: Record<string, string> = {}, value = 1) {
      const k = labelKey(labels);
      let s = state.series.get(k);
      if (!s) {
        s = { labels, value: 0 };
        state.series.set(k, s);
      }
      s.value += value;
    },
  };
}

/** Process-wide shared histogram — same registry semantics as {@link useGlobalCounter}. */
export function useGlobalHistogram(name: string, opts: GlobalHistogramOptions = {}): PromHistogram {
  const key = `histogram\n${name}`;
  let state = globalMetrics.get(key) as GlobalHistogramState | undefined;
  if (!state) {
    const buckets = [...(opts.buckets ?? DEFAULT_BUCKETS)].sort((a, b) => a - b);
    state = { kind: "histogram", name, help: opts.help ?? `Custom global histogram ${name}.`, buckets, series: new Map() };
    globalMetrics.set(key, state);
  }
  return {
    name,
    observe(value: number, labels: Record<string, string> = {}) {
      observeSeries(state.series, state.buckets, labels, value);
    },
  };
}

/** Test seam: drop every registered global metric and its data. */
export function __resetGlobalMetricsForTests(): void {
  globalMetrics.clear();
}

/** Render all registered global metrics as exposition lines. */
function renderGlobals(): string[] {
  const out: string[] = [];
  for (const metric of globalMetrics.values()) {
    if (metric.kind === "counter") {
      out.push(`# HELP ${metric.name} ${metric.help}`);
      out.push(`# TYPE ${metric.name} counter`);
      for (const s of metric.series.values()) {
        out.push(`${metric.name}${renderLabels(s.labels)} ${s.value}`);
      }
    } else {
      renderHistogramSeries(out, metric.name, metric.help, metric.buckets, metric.series);
    }
  }
  return out;
}

/**
 * Record HTTP metrics and serve them at `GET {path}`. Register early so the
 * middleware observes the final status/latency of every downstream handler.
 *
 * Exposes three metrics (all name-prefixed by `opts.prefix`):
 * - `http_requests_total` — counter, labeled `method` + `status`.
 * - `http_request_duration_seconds` — histogram (`_bucket`/`_sum`/`_count`).
 * - `http_requests_in_flight` — gauge.
 */
export function metrics(opts: MetricsOptions = {}): Middleware {
  const path = opts.path ?? "/metrics";
  const buckets = [...(opts.buckets ?? DEFAULT_BUCKETS)].sort((a, b) => a - b);
  const prefix = opts.prefix ?? "";

  const NAME_TOTAL = `${prefix}http_requests_total`;
  const NAME_DURATION = `${prefix}http_request_duration_seconds`;
  const NAME_IN_FLIGHT = `${prefix}http_requests_in_flight`;

  // Aggregated state. Counter and histogram share the same label sets, so we keep
  // both facets on one Series record per label key.
  const series = new Map<string, Series>();
  let inFlight = 0;

  function recordSeries(labels: Record<string, string>, seconds: number): void {
    observeSeries(series, buckets, labels, seconds);
  }

  function render(): string {
    const out: string[] = [];

    // http_requests_total (counter)
    out.push(`# HELP ${NAME_TOTAL} Total number of HTTP requests.`);
    out.push(`# TYPE ${NAME_TOTAL} counter`);
    for (const s of series.values()) {
      out.push(`${NAME_TOTAL}${renderLabels(s.labels)} ${s.count}`);
    }

    // http_request_duration_seconds (histogram)
    renderHistogramSeries(out, NAME_DURATION, "HTTP request latency in seconds.", buckets, series);

    // http_requests_in_flight (gauge)
    out.push(`# HELP ${NAME_IN_FLIGHT} Number of HTTP requests currently being served.`);
    out.push(`# TYPE ${NAME_IN_FLIGHT} gauge`);
    out.push(`${NAME_IN_FLIGHT} ${inFlight}`);

    // Custom globals registered via useGlobalCounter/useGlobalHistogram.
    out.push(...renderGlobals());

    return out.join("\n") + "\n";
  }

  return async (ctx, next) => {
    const req = ctx.request;
    const method = (req.method ?? "GET").toUpperCase();

    // Serve the exposition without recording it (and without touching in-flight).
    if (method === "GET" && pathOf(req.url) === path) {
      return Response.text(render(), {
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }

    inFlight += 1;
    const start = performance.now();
    try {
      return await next();
    } finally {
      const seconds = (performance.now() - start) / 1000;
      inFlight -= 1;
      const status = String(ctx.response.statusCode || 200);
      const labels: Record<string, string> = { method, status };
      if (opts.route) labels.route = opts.route(ctx);
      recordSeries(labels, seconds);
    }
  };
}

/** `le` label value — integers stay bare, fractions keep their decimal form. */
function formatLe(n: number): string {
  return String(n);
}

/** Strip query string / fragment so `/metrics?x=1` still matches `/metrics`. */
function pathOf(url: string | undefined): string {
  if (!url) return "/";
  const q = url.indexOf("?");
  const h = url.indexOf("#");
  let end = url.length;
  if (q !== -1) end = Math.min(end, q);
  if (h !== -1) end = Math.min(end, h);
  return url.slice(0, end);
}
