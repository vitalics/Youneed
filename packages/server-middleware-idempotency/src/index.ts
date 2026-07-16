// @youneed/server middleware — Idempotency-Key (Stripe-style). Make UNSAFE requests
// safely retryable: the client sends a unique `Idempotency-Key` header per logical
// operation, and a retry with the SAME key replays the first response instead of
// running the handler twice.
//
//   import { idempotency } from "@youneed/server-middleware-idempotency";
//   import { RedisKV } from "@youneed/kv-redis";
//
//   app.use(idempotency({ store: new RedisKV({ url: "redis://…" }), ttl: 86400 }))
//      .post("/charges", () => Response.json(charge()));   // double-click → one charge
//
// Result lifecycle, per keyed request (resKey = `${prefix}res:${key}`,
// lockKey = `${prefix}lock:${key}`):
//   1. A cached result for the key exists → REPLAY it (handler NOT run), tagging the
//      response `Idempotent-Replayed: true`. If the request "fingerprint" (method+url)
//      differs from the one that produced the cache, it's the same key reused for a
//      DIFFERENT request → 422 (Stripe's "keys can only be reused for the same request").
//   2. No cache yet → acquire a short-lived lock atomically (`incr === 1` is SETNX).
//      If we don't own the lock, another request is in flight → 409 + `Retry-After: 1`
//      (after one re-check of the cache, in case it just landed).
//   3. We own the lock → run the handler, cache a SUCCESSFUL JSON result, return it.
//      Server errors (5xx), streamed responses and non-serializable bodies are NOT
//      cached, and the lock is released so a genuine retry can proceed.
//
// The default store is an in-process `MemoryKV` — correct for a SINGLE instance. Behind
// a load balancer, pass a shared store (e.g. `@youneed/kv-redis`) so every instance sees
// the same keys; the KV lock then serializes concurrent retries across the fleet.
import type { Context, Middleware } from "@youneed/server";
import { Response, isResult } from "@youneed/server";
import { MemoryKV, type KV } from "@youneed/kv";
import { createHash } from "node:crypto";

export interface IdempotencyOptions {
  /** KV backing the keys (default: a fresh in-process `MemoryKV`, single-instance only).
   *  Behind a load balancer, share one store (e.g. `@youneed/kv-redis`). */
  store?: KV;
  /** Seconds to retain a cached result (default `86400` = 24h). */
  ttl?: number;
  /** Seconds the in-flight lock lives — a ceiling on how long a handler may run before
   *  a concurrent retry is allowed to proceed (default `60`). */
  lockTtl?: number;
  /** Unsafe methods this applies to (default `["POST","PUT","PATCH","DELETE"]`). Other
   *  methods pass straight through. */
  methods?: string[];
  /** Header carrying the key (default `"idempotency-key"`). */
  header?: string;
  /** Require the header on every unsafe request — `400` when absent (default `false`,
   *  i.e. un-keyed requests pass through untouched). */
  required?: boolean;
  /** KV key prefix (default `"idem:"`). */
  prefix?: string;
}

interface CachedResult {
  fingerprint: string;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** sha256 of `method + " " + url` — detects the same key replayed for a different request. */
function fingerprintOf(method: string, url: string): string {
  return createHash("sha256").update(`${method} ${url}`).digest("hex");
}

function replay(c: CachedResult): unknown {
  return Response.json(c.body, {
    status: c.status,
    headers: { ...(c.headers ?? {}), "Idempotent-Replayed": "true" },
  });
}

/**
 * Idempotency-Key middleware. Register it before the routes you want to protect.
 * Returns the {@link IdempotencyOptions}-configured {@link Middleware}.
 */
export function idempotency(opts: IdempotencyOptions = {}): Middleware {
  const store = opts.store ?? new MemoryKV();
  const ttl = opts.ttl ?? 86_400;
  const lockTtl = opts.lockTtl ?? 60;
  const header = (opts.header ?? "idempotency-key").toLowerCase();
  const prefix = opts.prefix ?? "idem:";
  const methods = new Set((opts.methods ?? ["POST", "PUT", "PATCH", "DELETE"]).map((m) => m.toUpperCase()));

  // Same-process coalescing: two concurrent same-key requests on THIS instance share one
  // `next()` instead of one 409-ing the other. Cross-instance is handled by the KV lock.
  const inflight = new Map<string, Promise<CachedResult | null>>();

  return async (ctx: Context, next) => {
    const method = (ctx.request.method ?? "GET").toUpperCase();
    if (!methods.has(method)) return next();

    const hv = ctx.request.headers[header];
    const key = Array.isArray(hv) ? hv[0] : hv;
    if (!key) {
      if (opts.required) return Response.json({ error: "Idempotency-Key header required" }, { status: 400 });
      return next(); // un-keyed → pass through untouched (no caching)
    }

    const url = ctx.request.url ?? "";
    const fingerprint = fingerprintOf(method, url);
    const resKey = `${prefix}res:${key}`;
    const lockKey = `${prefix}lock:${key}`;

    // 1. Already have a result for this key → replay (or reject a different request).
    const cachedRaw = await store.get(resKey);
    if (cachedRaw !== undefined) {
      const cached = JSON.parse(cachedRaw) as CachedResult;
      if (cached.fingerprint !== fingerprint) {
        return Response.json({ error: "Idempotency-Key reused for a different request" }, { status: 422 });
      }
      return replay(cached);
    }

    // Same-process: if another request for this key is already computing here, ride along.
    const pending = inflight.get(key);
    if (pending) {
      const c = await pending;
      if (c) {
        if (c.fingerprint !== fingerprint) {
          return Response.json({ error: "Idempotency-Key reused for a different request" }, { status: 422 });
        }
        return replay(c);
      }
      // The leader produced an uncacheable result (5xx / stream / non-JSON) — fall
      // through and try to acquire the lock ourselves.
    }

    // 2. Acquire the cross-instance lock atomically (incr === 1 means WE created it).
    const owner = (await store.incr(lockKey, { ttl: lockTtl })) === 1;
    if (!owner) {
      // Someone else holds the lock. Re-check the cache once — it may have just landed.
      const nowRaw = await store.get(resKey);
      if (nowRaw !== undefined) {
        const cached = JSON.parse(nowRaw) as CachedResult;
        if (cached.fingerprint !== fingerprint) {
          return Response.json({ error: "Idempotency-Key reused for a different request" }, { status: 422 });
        }
        return replay(cached);
      }
      return Response.json(
        { error: "A request with this Idempotency-Key is already in progress" },
        { status: 409, headers: { "Retry-After": "1" } },
      );
    }

    // 3. We own the lock — run the handler, cache a successful result.
    let resolveLocal!: (c: CachedResult | null) => void;
    inflight.set(
      key,
      new Promise<CachedResult | null>((r) => {
        resolveLocal = r;
      }),
    );
    let toCache: CachedResult | null = null;
    try {
      const result = await next();
      const status = isResult(result) ? result.status : ctx.response.statusCode || 200;
      const body = isResult(result) ? result.body : result;
      const headersSent = ctx.response.headersSent || ctx.response.writableEnded;

      let serializable = true;
      try {
        JSON.stringify(body);
      } catch {
        serializable = false;
      }

      if (!headersSent && serializable && status < 500) {
        toCache = { fingerprint, status, body };
        await store.set(resKey, JSON.stringify(toCache), { ttl });
        // Result is cached; the lock can expire on its own (TTL), no need to delete.
      } else {
        // Don't cache server errors / streamed / non-serializable — free the lock so a
        // genuine retry can proceed.
        await store.delete(lockKey);
      }
      return result;
    } catch (err) {
      // Handler threw — release the lock so the failed op can be retried, then rethrow.
      await store.delete(lockKey);
      throw err;
    } finally {
      resolveLocal(toCache);
      inflight.delete(key);
    }
  };
}
