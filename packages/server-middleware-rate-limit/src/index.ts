// ── Rate limiting (pluggable strategies) ───────────────────────────────────────
//
// `rateLimit({ strategy })` takes either a built-in NAME or a RateLimitStrategy
// INSTANCE. A strategy is an object — a subclass of the abstract
// `RateLimitStrategy` — that, given a client key + the current time, decides
// allow/deny. The base owns the per-key store + bounded eviction; a subclass
// implements just the algorithm, so you can drop in your own (leaky bucket, GCRA,
// a Redis-backed limiter, …) without touching the middleware.
//
// Built in: FixedWindow, SlidingWindowLog, TokenBucket, LeakyBucket, ExponentialBackoff.
import { HttpError } from "@youneed/server";
import type { Middleware, Context } from "@youneed/server";
import type { KV } from "@youneed/kv";

/** A per-request verdict. `resetMs` is absolute epoch ms; `retryAfterMs` relative. */
export interface RateDecision {
  limited: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs: number;
}

/**
 * The minimal contract `rateLimit({ strategy })` consumes. `check` may return a
 * verdict synchronously OR asynchronously — so an in-memory limiter and a
 * distributed (KV-backed, network-I/O) one both satisfy it. The abstract
 * `RateLimitStrategy` and every built-in implement this.
 */
export interface RateLimiter {
  /** Value reported in the `X-RateLimit-Limit` header. */
  readonly limit: number;
  /** Check (and record) a hit for `key` at `now`; verdict may be async. */
  check(key: string, now: number): RateDecision | Promise<RateDecision>;
}

/**
 * Abstract rate-limit strategy. Subclass it and implement `decide` (the
 * algorithm) + `dead` (when a key's state can be evicted); the base owns the
 * per-key store and keeps it bounded. Pass an instance to `rateLimit({ strategy })`.
 */
export abstract class RateLimitStrategy<S = unknown> implements RateLimiter {
  protected readonly hits = new Map<string, S>();
  /** Value reported in the `X-RateLimit-Limit` header. */
  abstract readonly limit: number;
  /** Decide for the current `state` (undefined on the key's first hit) at `now`,
   *  returning the next state to store and the verdict. */
  protected abstract decide(state: S | undefined, now: number): { state: S; decision: RateDecision };
  /** True when `state` can no longer limit anyone → safe to evict. */
  protected abstract dead(state: S, now: number): boolean;

  /** Check (and record) a hit for `key` at `now`. Called by the middleware. */
  check(key: string, now: number): RateDecision {
    const { state, decision } = this.decide(this.hits.get(key), now);
    this.hits.set(key, state);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (this.dead(v, now)) this.hits.delete(k);
    return decision;
  }
}

export interface WindowConfig {
  windowMs?: number; // default 60s
  max?: number; // default 100 per window
}

/** Fixed window: one counter per `windowMs`. Cheapest; can allow up to 2×max
 *  across a window boundary. */
export class FixedWindow extends RateLimitStrategy<{ count: number; reset: number }> {
  readonly limit: number;
  #windowMs: number;
  constructor({ windowMs = 60_000, max = 100 }: WindowConfig = {}) {
    super();
    this.limit = max;
    this.#windowMs = windowMs;
  }
  protected decide(state: { count: number; reset: number } | undefined, now: number) {
    const s = !state || state.reset <= now ? { count: 0, reset: now + this.#windowMs } : state;
    s.count++;
    return {
      state: s,
      decision: { limited: s.count > this.limit, remaining: Math.max(0, this.limit - s.count), resetMs: s.reset, retryAfterMs: s.reset - now },
    };
  }
  protected dead(s: { reset: number }, now: number) {
    return s.reset <= now;
  }
}

/** Sliding window (log): the limit holds over the last `windowMs` at every
 *  instant — no window-boundary burst. Bounded memory: once at `max` we reject
 *  instead of recording, so a key never stores more than `max` timestamps. */
export class SlidingWindowLog extends RateLimitStrategy<number[]> {
  readonly limit: number;
  #windowMs: number;
  constructor({ windowMs = 60_000, max = 100 }: WindowConfig = {}) {
    super();
    this.limit = max;
    this.#windowMs = windowMs;
  }
  protected decide(state: number[] | undefined, now: number) {
    const log = state ?? [];
    const cutoff = now - this.#windowMs;
    let i = 0; // timestamps are appended in order — drop the expired prefix
    while (i < log.length && log[i] <= cutoff) i++;
    if (i > 0) log.splice(0, i);
    if (log.length >= this.limit) {
      const resetMs = log[0] + this.#windowMs;
      return { state: log, decision: { limited: true, remaining: 0, resetMs, retryAfterMs: resetMs - now } };
    }
    log.push(now);
    const resetMs = log[0] + this.#windowMs;
    return { state: log, decision: { limited: false, remaining: this.limit - log.length, resetMs, retryAfterMs: resetMs - now } };
  }
  protected dead(log: number[], now: number) {
    return !log.length || log[log.length - 1] <= now - this.#windowMs;
  }
}

export interface TokenBucketConfig {
  /** Burst size — tokens the bucket holds when full (default 100). */
  capacity?: number;
  /** Sustained rate: tokens added per second (default 10). */
  refillPerSec?: number;
}

/** Token bucket: each request spends one token; tokens refill continuously at
 *  `refillPerSec`. Allows bursts up to `capacity`, then paces to the refill rate. */
export class TokenBucket extends RateLimitStrategy<{ tokens: number; last: number }> {
  readonly limit: number;
  #capacity: number;
  #refillPerMs: number;
  constructor({ capacity = 100, refillPerSec = 10 }: TokenBucketConfig = {}) {
    super();
    this.limit = capacity;
    this.#capacity = capacity;
    this.#refillPerMs = refillPerSec / 1000;
  }
  protected decide(state: { tokens: number; last: number } | undefined, now: number) {
    const s = state ?? { tokens: this.#capacity, last: now };
    s.tokens = Math.min(this.#capacity, s.tokens + (now - s.last) * this.#refillPerMs);
    s.last = now;
    if (s.tokens >= 1) {
      s.tokens -= 1;
      const resetMs = now + Math.ceil((this.#capacity - s.tokens) / this.#refillPerMs); // full again
      return { state: s, decision: { limited: false, remaining: Math.floor(s.tokens), resetMs, retryAfterMs: 0 } };
    }
    const waitMs = Math.ceil((1 - s.tokens) / this.#refillPerMs); // until one token returns
    return { state: s, decision: { limited: true, remaining: 0, resetMs: now + waitMs, retryAfterMs: waitMs } };
  }
  protected dead(s: { tokens: number; last: number }, now: number) {
    return (now - s.last) * this.#refillPerMs >= this.#capacity; // refilled to full long ago
  }
}

export interface LeakyBucketConfig {
  /** Burst size — requests allowed instantly before pacing kicks in (default 100). */
  capacity?: number;
  /** Outflow rate: requests drained per second (default 10). */
  leakPerSec?: number;
}

/** Leaky bucket (as a meter, GCRA formulation): requests pour in and the bucket
 *  drains at exactly `leakPerSec` — after a burst of `capacity` the pace is a
 *  strict one-per-interval, the classic Nginx `limit_req` behaviour. Tracked as
 *  the theoretical arrival time (TAT): a hit is allowed while `tat - now` stays
 *  within the burst tolerance `(capacity - 1) · interval`; each allowed hit
 *  pushes the TAT one emission interval out. */
export class LeakyBucket extends RateLimitStrategy<{ tat: number }> {
  readonly limit: number;
  #intervalMs: number;
  #toleranceMs: number;
  constructor({ capacity = 100, leakPerSec = 10 }: LeakyBucketConfig = {}) {
    super();
    this.limit = capacity;
    this.#intervalMs = 1000 / leakPerSec;
    this.#toleranceMs = Math.max(0, capacity - 1) * this.#intervalMs;
  }
  protected decide(state: { tat: number } | undefined, now: number) {
    const tat = state?.tat ?? now;
    const overBy = tat - now - this.#toleranceMs;
    if (overBy > 0) {
      const waitMs = Math.ceil(overBy);
      return { state: { tat }, decision: { limited: true, remaining: 0, resetMs: now + waitMs, retryAfterMs: waitMs } };
    }
    const next = Math.max(now, tat) + this.#intervalMs;
    // How many MORE hits pass at `now`: tat + (k-1)·interval ≤ now + tolerance.
    const remaining = Math.max(0, Math.floor((this.#toleranceMs - (next - now)) / this.#intervalMs) + 1);
    return { state: { tat: next }, decision: { limited: false, remaining, resetMs: next, retryAfterMs: 0 } };
  }
  protected dead(s: { tat: number }, now: number) {
    return s.tat <= now; // fully drained
  }
}

export interface ExponentialBackoffConfig extends WindowConfig {
  /** Ceiling on the doubling cooldown (default 1h). */
  maxBlockMs?: number;
}

/** Exponential backoff: exceed the window and your cooldown DOUBLES each strike
 *  (windowMs · 2^(strikes-1), capped at `maxBlockMs`). A clean window forgives. */
export class ExponentialBackoff extends RateLimitStrategy<{ count: number; reset: number; strikes: number; blockedUntil: number }> {
  readonly limit: number;
  #windowMs: number;
  #maxBlockMs: number;
  constructor({ windowMs = 60_000, max = 100, maxBlockMs = 3_600_000 }: ExponentialBackoffConfig = {}) {
    super();
    this.limit = max;
    this.#windowMs = windowMs;
    this.#maxBlockMs = maxBlockMs;
  }
  protected decide(state: { count: number; reset: number; strikes: number; blockedUntil: number } | undefined, now: number) {
    const s = state ?? { count: 0, reset: now + this.#windowMs, strikes: 0, blockedUntil: 0 };
    // Serving a cooldown → reject without counting (don't extend it every hit).
    if (s.blockedUntil > now) {
      return { state: s, decision: { limited: true, remaining: 0, resetMs: s.blockedUntil, retryAfterMs: s.blockedUntil - now } };
    }
    if (s.reset <= now) {
      if (s.count <= this.limit) s.strikes = 0; // a clean window forgives past strikes
      s.count = 0;
      s.reset = now + this.#windowMs;
    }
    s.count++;
    if (s.count > this.limit) {
      s.strikes++;
      const cooldown = Math.min(this.#maxBlockMs, this.#windowMs * 2 ** (s.strikes - 1));
      s.blockedUntil = now + cooldown;
      return { state: s, decision: { limited: true, remaining: 0, resetMs: s.blockedUntil, retryAfterMs: cooldown } };
    }
    return { state: s, decision: { limited: false, remaining: Math.max(0, this.limit - s.count), resetMs: s.reset, retryAfterMs: s.reset - now } };
  }
  protected dead(s: { reset: number; blockedUntil: number }, now: number) {
    return s.reset <= now && s.blockedUntil <= now;
  }
}

export interface KvFixedWindowConfig {
  windowMs?: number; // default 60s
  max?: number; // default 100 per window
  /** Key prefix in the store (default `"rl:"`). Lets several limiters share one KV. */
  prefix?: string;
}

/**
 * Distributed fixed window backed by a `KV`. Unlike the in-memory strategies
 * (which count per-process — so behind N instances the effective limit is N×max),
 * the counter lives in a SHARED store, so the limit holds across every app
 * instance behind the load balancer.
 *
 * One counter key per (`key`, window bucket); `kv.incr({ ttl })` increments and —
 * only when the key is first created — sets the bucket's expiry, both atomically.
 * That single atomic op is what makes the limiter race-free across instances.
 */
export class KvFixedWindow implements RateLimiter {
  readonly limit: number;
  #kv: KV;
  #windowMs: number;
  #prefix: string;
  constructor(kv: KV, { windowMs = 60_000, max = 100, prefix = "rl:" }: KvFixedWindowConfig = {}) {
    this.#kv = kv;
    this.limit = max;
    this.#windowMs = windowMs;
    this.#prefix = prefix;
  }
  async check(key: string, now: number): Promise<RateDecision> {
    const windowSec = Math.ceil(this.#windowMs / 1000);
    const bucket = Math.floor(now / this.#windowMs);
    const k = this.#prefix + key + ":" + bucket;
    const count = await this.#kv.incr(k, { ttl: windowSec });
    const resetMs = (bucket + 1) * this.#windowMs;
    return { limited: count > this.limit, remaining: Math.max(0, this.limit - count), resetMs, retryAfterMs: resetMs - now };
  }
}

/** Built-in strategy shorthands (configured from `windowMs`/`max`/`maxBlockMs`). */
export type RateLimitStrategyName = "fixed" | "sliding" | "exponential" | "token-bucket" | "leaky-bucket";

export interface RateLimitOptions {
  windowMs?: number; // default 60s — for the name shorthands
  max?: number; // default 100 — for the name shorthands
  maxBlockMs?: number; // "exponential" shorthand only
  key?: (ctx: Context) => string; // default: client IP
  statusCode?: number; // default 429
  message?: unknown; // default { error: "Too Many Requests" }
  /** A `RateLimiter` INSTANCE (a `RateLimitStrategy` subclass, `KvFixedWindow`,
   *  or any custom limiter), or a built-in NAME. Default `"fixed"`. */
  strategy?: RateLimiter | RateLimitStrategyName;
}

/** Turn the `strategy` option into a concrete limiter instance. */
function resolveRateStrategy(opts: RateLimitOptions): RateLimiter {
  if (opts.strategy && typeof opts.strategy === "object") return opts.strategy;
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 100;
  switch (opts.strategy) {
    case "sliding":
      return new SlidingWindowLog({ windowMs, max });
    case "exponential":
      return new ExponentialBackoff({ windowMs, max, maxBlockMs: opts.maxBlockMs ?? 3_600_000 });
    case "token-bucket":
      return new TokenBucket({ capacity: max, refillPerSec: max / (windowMs / 1000) });
    case "leaky-bucket":
      return new LeakyBucket({ capacity: max, leakPerSec: max / (windowMs / 1000) });
    default:
      return new FixedWindow({ windowMs, max });
  }
}

/** Rate limiter with a pluggable strategy + standard `X-RateLimit-*`/`Retry-After`. */
export function rateLimit(opts: RateLimitOptions = {}): Middleware {
  const strategy = resolveRateStrategy(opts);
  const keyOf = opts.key ?? ((ctx) => ctx.request.socket?.remoteAddress ?? "global");
  return async (ctx, next) => {
    const d = await strategy.check(keyOf(ctx), Date.now());
    const res = ctx.response;
    res.setHeader("X-RateLimit-Limit", String(strategy.limit));
    res.setHeader("X-RateLimit-Remaining", String(d.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(d.resetMs / 1000)));
    if (d.limited) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(d.retryAfterMs / 1000))));
      throw new HttpError(opts.statusCode ?? 429, opts.message ?? { error: "Too Many Requests" });
    }
    return next();
  };
}
