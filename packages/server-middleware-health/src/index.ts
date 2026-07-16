// @youneed/server middleware — Kubernetes-style liveness/readiness probe endpoints.
//
//   const h = health();
//   app.use(h)
//      .get("/users", () => Response.json([/* … */]));
//   // GET /healthz → 200 { status: "ok" }   (liveness)
//   // GET /readyz  → 200 { status: "ready" } / 503 { status: "not ready" }  (readiness)
//
// Wire `setReady(false)` into graceful shutdown so the load balancer stops routing
// new traffic *before* connections drain:
//
//   app.listen(p, (s) => s.gracefulShutdown({ onShutdown: () => h.setReady(false) }));
//
// **Liveness** answers "is the process alive?" — a failing liveness probe makes
// Kubernetes restart the pod. **Readiness** answers "can it serve traffic right
// now?" — a failing readiness probe pulls the pod out of the Service endpoints
// without restarting it.
import type { Context, Middleware } from "@youneed/server";
import { Response } from "@youneed/server";

/** A named readiness check: returns `true` (or resolves `true`) when healthy. */
export type HealthCheck = () => boolean | Promise<boolean>;

export interface HealthOptions {
  /** Path for the liveness probe (default `"/healthz"`). */
  livePath?: string;
  /** Path for the readiness probe (default `"/readyz"`). */
  readyPath?: string;
  /** Initial readiness state (default `true` — starts ready). */
  ready?: boolean;
  /** Named readiness checks; any returning false/throwing → not ready. */
  checks?: Record<string, HealthCheck>;
}

/** A {@link Middleware} with programmatic control over the probe state. */
export type HealthMiddleware = Middleware & {
  /** Flip readiness — wire `setReady(false)` into graceful shutdown. */
  setReady(ready: boolean): void;
  /** Flip liveness — `setLive(false)` makes `/healthz` return 503. */
  setLive(live: boolean): void;
  /** Current readiness state. */
  readonly ready: boolean;
  /** Current liveness state. */
  readonly live: boolean;
};

/** Strip the query string (and fragment) from a request URL → just the path. */
function pathOf(url: string): string {
  const q = url.indexOf("?");
  const h = url.indexOf("#");
  let end = url.length;
  if (q !== -1) end = q;
  if (h !== -1 && h < end) end = h;
  return url.slice(0, end);
}

/**
 * Liveness/readiness probe middleware. Register early so the probes are cheap and
 * unaffected by downstream middleware. Returns a {@link HealthMiddleware} — a
 * middleware function with `.setReady()` / `.setLive()` / `.ready` / `.live`.
 */
export function health(opts: HealthOptions = {}): HealthMiddleware {
  const livePath = opts.livePath ?? "/healthz";
  const readyPath = opts.readyPath ?? "/readyz";
  const checks = opts.checks ?? {};
  let ready = opts.ready ?? true;
  let live = true;

  const mw: Middleware = async (ctx: Context, next) => {
    if (ctx.request.method !== "GET") return next();
    const path = pathOf(ctx.request.url ?? "");

    if (path === livePath) {
      return live
        ? Response.json({ status: "ok" })
        : Response.json({ status: "not alive" }, { status: 503 });
    }

    if (path === readyPath) {
      if (!ready) return Response.json({ status: "not ready" }, { status: 503 });

      const names = Object.keys(checks);
      if (names.length === 0) return Response.json({ status: "ready" });

      const results: Record<string, boolean> = {};
      let ok = true;
      for (const name of names) {
        let pass = false;
        try {
          pass = await checks[name]();
        } catch {
          pass = false;
        }
        results[name] = pass;
        if (!pass) ok = false;
      }
      return ok
        ? Response.json({ status: "ready", checks: results })
        : Response.json({ status: "not ready", checks: results }, { status: 503 });
    }

    return next();
  };

  return Object.defineProperties(mw, {
    setReady: { value: (v: boolean) => void (ready = v) },
    setLive: { value: (v: boolean) => void (live = v) },
    ready: { get: () => ready },
    live: { get: () => live },
  }) as HealthMiddleware;
}
