// ── @youneed/server-plugin-kv — mount a KV store as a ServerPlugin ────────────
//
// The data layer is @youneed/server-plugin-store: the `KV` contract + the
// built-in `MemoryKV`, with the physical backend chosen by adapter (redis/… via
// `@youneed/kv-redis`). THIS package wraps any `KV` so its traffic is observable:
//
//   • TrackedKV — a transparent `KV` proxy that counts reads/writes/hit-rate and
//                 keeps a ring buffer of recent ops, for the devtools view.
//   • kv(store) — a ServerPlugin: mounts a small internal API (browse keys, get /
//                 set / delete a value) and an `inspect()` so — when
//                 `@youneed/server-plugin-devtools` is mounted — it surfaces a KV
//                 node on the flow graph, its own header tab and a key browser.
//
// Mirror of `@youneed/server-plugin-pubsub` (PubSub → kv is to KV). Re-exports the
// store for convenience so a consumer needs a single import.

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";
import { MemoryKV, type KV, type SetOptions, type IncrOptions } from "@youneed/server-plugin-store";

export * from "@youneed/server-plugin-store"; // KV contract + MemoryKV + namespaced, for convenience

/** A single recorded operation — for the devtools activity feed. */
export interface KvOp {
  at: number;
  op: "get" | "set" | "delete" | "incr";
  key: string;
  /** For `get`: did the key exist? Lets the UI compute a hit-rate. */
  hit?: boolean;
}

/** Aggregate counters, surfaced to devtools. */
export interface KvStat {
  gets: number;
  sets: number;
  deletes: number;
  incrs: number;
  /** `get`/`incr` calls that found an existing value. */
  hits: number;
  /** `get` calls that missed. */
  misses: number;
}

/** Resolve a human label for a backend (`KV` has no required `name`). */
function backendName(kv: KV): string {
  if (kv instanceof MemoryKV) return "memory";
  return (kv as { name?: string }).name ?? "kv";
}

/**
 * Wrap a {@link KV} to record activity (per-op counters, hit/miss, a ring buffer
 * of recent ops) for the devtools view. Every contract method delegates to the
 * backend unchanged — pass the SAME instance to `kv(...)` and to your consumers
 * (sessions, cache, rate-limit) so all traffic is tracked.
 */
export class TrackedKV implements KV {
  readonly #backend: KV;
  readonly #recentMax: number;
  readonly #stats: KvStat = { gets: 0, sets: 0, deletes: 0, incrs: 0, hits: 0, misses: 0 };
  readonly #recent: KvOp[] = [];

  constructor(backend: KV = new MemoryKV(), opts: { recent?: number } = {}) {
    this.#backend = backend;
    this.#recentMax = opts.recent ?? 25;
  }

  get name(): string {
    return backendName(this.#backend);
  }

  #record(op: KvOp): void {
    this.#recent.push(op);
    if (this.#recent.length > this.#recentMax) this.#recent.shift();
  }

  async get(key: string): Promise<string | undefined> {
    const value = await this.#backend.get(key);
    this.#stats.gets += 1;
    const hit = value !== undefined;
    if (hit) this.#stats.hits += 1;
    else this.#stats.misses += 1;
    this.#record({ at: Date.now(), op: "get", key, hit });
    return value;
  }

  async set(key: string, value: string, opts?: SetOptions): Promise<void> {
    await this.#backend.set(key, value, opts);
    this.#stats.sets += 1;
    this.#record({ at: Date.now(), op: "set", key });
  }

  async delete(key: string): Promise<void> {
    await this.#backend.delete(key);
    this.#stats.deletes += 1;
    this.#record({ at: Date.now(), op: "delete", key });
  }

  async incr(key: string, opts?: IncrOptions): Promise<number> {
    const next = await this.#backend.incr(key, opts);
    this.#stats.incrs += 1;
    this.#record({ at: Date.now(), op: "incr", key });
    return next;
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.#backend.expire(key, ttl);
  }

  async ttl(key: string): Promise<number> {
    return this.#backend.ttl(key);
  }

  async scan(prefix: string): Promise<string[]> {
    if (!this.#backend.scan) throw new Error("backend does not support scan()");
    return this.#backend.scan(prefix);
  }

  async close(): Promise<void> {
    await this.#backend.close?.();
  }

  /** Whether the backend can enumerate keys (powers the devtools key browser). */
  get scannable(): boolean {
    return typeof this.#backend.scan === "function";
  }

  /** Snapshot of the aggregate counters. */
  stats(): KvStat {
    return { ...this.#stats };
  }

  /** Snapshot of the recent-ops ring buffer (oldest → newest). */
  recent(): KvOp[] {
    return [...this.#recent];
  }
}

export interface KvPluginOptions {
  /** Internal route prefix (default `"/__kv"`). */
  basePath?: string;
  /** Mount the devtools introspection + browse/get/set/delete routes (default true). */
  exposeDevtools?: boolean;
  /** Max keys returned by the browse endpoint (default 200). */
  scanLimit?: number;
}

/** A key + its remaining TTL, as returned by the browse endpoint. */
export interface KvKeyInfo {
  key: string;
  /** Remaining TTL in seconds: `>= 0` live, `-1` no expiry, `-2` missing. */
  ttl: number;
}

/** The `inspect()` payload — devtools detects KV by `kind === "kv"`. */
export interface KvInspect {
  kind: "kv";
  backend: string;
  scannable: boolean;
  stats: KvStat;
  recent: KvOp[];
  endpoints: { keys: string; get: string; set: string; delete: string };
}

/**
 * Mount KV introspection as a ServerPlugin. Pass a {@link TrackedKV} (wrap your
 * real backend with it). When `exposeDevtools` is on it exposes:
 *   • `GET  {basePath}/keys?prefix=`   — list keys (+ ttl), capped at `scanLimit`
 *   • `GET  {basePath}/get?key=`       — `{ key, value, ttl }`
 *   • `POST {basePath}/set {key,value,ttl?}`
 *   • `POST {basePath}/delete {key}`
 * and an `inspect()` so devtools draws the flow-graph node, header tab and the
 * key browser.
 */
export function kv(store: TrackedKV, opts: KvPluginOptions = {}): ServerPlugin {
  const basePath = (opts.basePath ?? "/__kv").replace(/\/$/, "");
  const scanLimit = opts.scanLimit ?? 200;
  const endpoints = {
    keys: `${basePath}/keys`,
    get: `${basePath}/get`,
    set: `${basePath}/set`,
    delete: `${basePath}/delete`,
  };

  return {
    name: "kv",
    setup(app) {
      if (opts.exposeDevtools === false) return;

      app.get(endpoints.keys, async (ctx: Context) => {
        if (!store.scannable) return Response.json({ error: "backend does not support scan()" }, { status: 501 });
        const prefix = String(ctx.query.prefix ?? "");
        const keys = (await store.scan(prefix)).slice(0, scanLimit);
        const out: KvKeyInfo[] = [];
        for (const key of keys) out.push({ key, ttl: await store.ttl(key) });
        return Response.json({ backend: store.name, keys: out, truncated: out.length >= scanLimit });
      });

      app.get(endpoints.get, async (ctx: Context) => {
        const key = String(ctx.query.key ?? "");
        if (!key) return Response.json({ error: "key is required" }, { status: 400 });
        const value = await store.get(key);
        if (value === undefined) return Response.json({ key, value: null, ttl: -2 });
        return Response.json({ key, value, ttl: await store.ttl(key) });
      });

      app.post(endpoints.set, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { key?: string; value?: string; ttl?: number };
        if (!body.key || typeof body.value !== "string") {
          return Response.json({ error: "key and value (string) are required" }, { status: 400 });
        }
        await store.set(body.key, body.value, body.ttl ? { ttl: body.ttl } : undefined);
        return Response.json({ ok: true });
      });

      app.post(endpoints.delete, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { key?: string };
        if (!body.key) return Response.json({ error: "key is required" }, { status: 400 });
        await store.delete(body.key);
        return Response.json({ ok: true });
      });
    },
    inspect(): KvInspect {
      return {
        kind: "kv",
        backend: store.name,
        scannable: store.scannable,
        stats: store.stats(),
        recent: store.recent(),
        endpoints,
      };
    },
  };
}

/** Convenience: a {@link TrackedKV} around `backend` (default in-process MemoryKV). */
export function createKV(backend?: KV, opts?: { recent?: number }): TrackedKV {
  return new TrackedKV(backend, opts);
}
