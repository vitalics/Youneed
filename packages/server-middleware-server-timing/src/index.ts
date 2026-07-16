// @youneed/server middleware — emit a `Server-Timing` response header so
// server-side phases show up in the browser's DevTools (Network → Timing).
//
//   app.use(serverTiming())                  // register early → accurate total
//      .get("/users", async (ctx) => {
//        const m = timing(ctx).metric("db");        // start a timer…
//        const rows = await db.query("…");
//        m.desc(`SQL · ${rows.length} rows`).stop(); // …configure desc, then stop
//        return Response.json(rows);
//      });
//   // → Server-Timing: db;dur=12.3;desc="SQL · 42 rows", total;dur=14.1
//
// Header grammar (MDN): a comma-separated list of metrics, each
//   name [ ";dur=" <number> ] [ ";desc=" <quoted-string> ]
// `name` is a token; `dur` is milliseconds; `desc` a quoted description.
import type { Context, Middleware } from "@youneed/server";

/** A live metric handle — configure it while the work runs, then `stop()`. */
export interface Metric {
  /** Set/override the description (chainable). */
  desc(text: string): this;
  /** Set an explicit duration in ms, overriding the timer (chainable). */
  dur(ms: number): this;
  /** Record the elapsed time (since `metric()` was called), unless `dur()` was set. */
  stop(): void;
}

/** Records server-side timing metrics for the current request. */
export interface ServerTiming {
  /** Start a configurable metric: `metric("db").desc("…").stop()`. The most
   *  flexible primitive — `start`/`measure` are built on it. An unstopped metric
   *  is finalized to "time until the response" automatically. */
  metric(name: string, desc?: string): Metric;
  /** Record a metric with a precomputed duration (ms). `desc` optional. */
  add(name: string, dur?: number, desc?: string): void;
  /** Start a timer; the returned fn records `name` with the elapsed ms. */
  start(name: string, desc?: string): () => void;
  /** Time a sync/async `fn`, record its duration as `name`, return its result. */
  measure<T>(name: string, fn: () => T | Promise<T>, desc?: string): Promise<T>;
}

export interface ServerTimingOptions {
  /** Add a metric for the TOTAL request duration. `true` (default) → name "total";
   *  a string sets the name; `false` disables it. */
  total?: boolean | string;
  /** Decimal places for `dur` values (default `2`). */
  precision?: number;
  /** Gate emission per request (e.g. only in dev, or behind a header) — the header
   *  carries internal timings, so you may not want it in production. Default: on. */
  enabled?: (ctx: Context) => boolean;
}

interface MetricRecord {
  name: string;
  dur?: number;
  desc?: string;
  started?: number; // set while a timer is running; cleared on stop / explicit dur
}

const STATE_KEY = "serverTiming";
// HTTP token chars (RFC 9110) — anything else in a name is replaced.
const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, "_") || "metric";

function serializeMetric(m: MetricRecord, precision: number): string {
  let out = sanitize(m.name);
  if (m.dur !== undefined && Number.isFinite(m.dur)) {
    out += `;dur=${String(Number(m.dur.toFixed(precision)))}`;
  }
  if (m.desc) out += `;desc=${JSON.stringify(String(m.desc))}`; // quoted-string, escaped
  return out;
}

function collector(metrics: MetricRecord[]): ServerTiming {
  const metric: ServerTiming["metric"] = (name, desc) => {
    const rec: MetricRecord = { name, desc, started: performance.now() };
    metrics.push(rec);
    const handle: Metric = {
      desc(text) {
        rec.desc = text;
        return handle;
      },
      dur(ms) {
        rec.dur = ms;
        rec.started = undefined; // explicit duration wins over the timer
        return handle;
      },
      stop() {
        if (rec.dur === undefined && rec.started !== undefined) {
          rec.dur = performance.now() - rec.started;
        }
        rec.started = undefined;
      },
    };
    return handle;
  };
  return {
    metric,
    add(name, dur, desc) {
      metrics.push({ name, dur, desc });
    },
    start(name, desc) {
      const m = metric(name, desc);
      return () => m.stop();
    },
    async measure(name, fn, desc) {
      const m = metric(name, desc);
      try {
        return await fn();
      } finally {
        m.stop();
      }
    },
  };
}

const NOOP: ServerTiming = {
  metric: () => {
    const h: Metric = { desc: () => h, dur: () => h, stop() {} };
    return h;
  },
  add() {},
  start: () => () => {},
  measure: (_name, fn) => Promise.resolve(fn()),
};

/**
 * Access the request's {@link ServerTiming} recorder. Returns a no-op when the
 * `serverTiming()` middleware isn't installed, so handlers can call it safely.
 */
export function timing(ctx: Context): ServerTiming {
  return (ctx.state[STATE_KEY] as ServerTiming | undefined) ?? NOOP;
}

/**
 * Collect server-side timing metrics during a request and emit them as a
 * `Server-Timing` response header. Register it EARLY (outermost) so the auto
 * `total` metric covers the whole request. Use {@link timing}`(ctx)` in handlers
 * / other middleware to record phases.
 */
export function serverTiming(opts: ServerTimingOptions = {}): Middleware {
  const totalName = opts.total === false ? null : typeof opts.total === "string" ? opts.total : "total";
  const precision = opts.precision ?? 2;
  return async (ctx, next) => {
    const metrics: MetricRecord[] = [];
    ctx.state[STATE_KEY] = collector(metrics);
    const t0 = performance.now();
    try {
      return await next();
    } finally {
      const now = performance.now();
      // Finalize any metric whose timer was never stopped → "time to response".
      for (const m of metrics) {
        if (m.dur === undefined && m.started !== undefined) m.dur = now - m.started;
      }
      if (totalName) metrics.push({ name: totalName, dur: now - t0 });
      const res = ctx.response;
      const emit = opts.enabled ? opts.enabled(ctx) : true;
      if (emit && metrics.length > 0 && !res.headersSent && !res.writableEnded) {
        const value = metrics.map((m) => serializeMetric(m, precision)).join(", ");
        const existing = res.getHeader("Server-Timing");
        res.setHeader("Server-Timing", existing ? `${String(existing)}, ${value}` : value);
      }
    }
  };
}
