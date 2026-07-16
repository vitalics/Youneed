// @youneed/server middleware — load-shedding via a global concurrency limit.
//
//   app.use(loadShed({ maxConcurrent: 500, retryAfter: 2 }))
//      .get("/work", () => doWork());
//   // under overload, surplus requests fast-fail with `503 + Retry-After` instead
//   // of piling up and dragging the whole server down (backpressure).
//
// Load-shedding ("shed load") protects a server during overload: rather than
// accepting every request and letting latency/memory blow up until the process
// collapses, you cap how many requests are in flight at once and *fast-fail* the
// surplus with `503 Service Unavailable`. A cheap rejection now keeps the
// requests you DO accept fast and healthy. This is a GLOBAL, here-and-now capacity
// gate — distinct from rate-limiting, which is per-client over a time window.
import type { Context, Middleware } from "@youneed/server";
import { Response } from "@youneed/server";

export interface LoadShedOptions {
  /** Max requests allowed in flight at once before shedding (default `100`). */
  maxConcurrent?: number;
  /** Seconds advertised in the `Retry-After` header when shedding (default `1`). */
  retryAfter?: number;
  /**
   * Custom shed decision, used INSTEAD of the simple `inflight >= maxConcurrent`
   * threshold. `inflight` is the current in-flight count (this request not yet
   * counted). Return `true` to shed. Lets callers fold in extra load signals
   * (event-loop lag, memory pressure, …).
   */
  shouldShed?: (ctx: Context, inflight: number) => boolean;
}

/** A {@link Middleware} that also exposes the live in-flight count. */
export interface LoadShedMiddleware extends Middleware {
  /** Current number of requests in flight through this middleware. */
  readonly inflight: number;
}

/**
 * Load-shedding middleware. Tracks in-flight requests; when the limit is reached
 * (or {@link LoadShedOptions.shouldShed} returns `true`), surplus requests are
 * fast-failed with `503 Service Unavailable` + `Retry-After` and `next()` is NOT
 * called. Register early so it gates work before it is started.
 */
export function loadShed(opts: LoadShedOptions = {}): LoadShedMiddleware {
  const maxConcurrent = opts.maxConcurrent ?? 100;
  const retryAfter = opts.retryAfter ?? 1;
  const shouldShed = opts.shouldShed ?? ((_ctx, inflight) => inflight >= maxConcurrent);

  let inflight = 0;

  const mw = (async (ctx, next) => {
    if (shouldShed(ctx, inflight)) {
      return Response.json(
        { error: "Service Unavailable" },
        { status: 503, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    inflight++;
    try {
      return await next();
    } finally {
      inflight--;
    }
  }) as LoadShedMiddleware;

  Object.defineProperty(mw, "inflight", { get: () => inflight, enumerable: true });
  return mw;
}
