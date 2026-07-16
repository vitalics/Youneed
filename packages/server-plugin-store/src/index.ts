// ── @youneed/kv — distributed key-value contract + in-process default ──────────
//
// The framework never *hosts* shared state. It defines the `KV` contract here;
// WHERE the data physically lives is chosen on deployment by which adapter you
// plug in:
//
//   • MemoryKV  (built-in)            → in this process. Single instance only.
//   • RedisKV   (@youneed/kv-redis)   → an external Redis/Valkey you run, shared
//                                        by every app instance behind the LB.
//
// Consumers (session store, rate-limit, cache) take a `KV` and don't care which.
// Values are strings — callers serialize (JSON, etc.). TTLs are in SECONDS.

export interface IncrOptions {
  /** Amount to add (default 1). */
  by?: number;
  /** When the key is *created* by this call, set its expiry to `ttl` seconds.
   *  Applied atomically with the increment — the basis for a race-free counter. */
  ttl?: number;
}

export interface SetOptions {
  /** Expiry in seconds. Omit for no expiry. */
  ttl?: number;
}

/** A distributed key-value store. Every op is async (adapters may do network I/O). */
export interface KV {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, opts?: SetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Atomically increment `key` by `opts.by` (default 1), creating it at 0 first.
   *  If `opts.ttl` is given and the key was newly created, set its expiry too —
   *  all in one atomic step. Returns the new value. */
  incr(key: string, opts?: IncrOptions): Promise<number>;
  /** Set the expiry (seconds) of an existing key. */
  expire(key: string, ttl: number): Promise<void>;
  /** Remaining TTL in seconds: `>= 0` live, `-1` no expiry, `-2` missing. */
  ttl(key: string): Promise<number>;
  /** List keys starting with `prefix` (for invalidation). Optional — adapters
   *  that can't scan cheaply may omit it; callers must tolerate its absence. */
  scan?(prefix: string): Promise<string[]>;
  /** Release any underlying resources (sockets). Optional. */
  close?(): Promise<void>;
}

interface Entry {
  value: string;
  /** Absolute expiry in epoch ms, or `0` for none. Compared against an injected clock. */
  expiresAt: number;
}

export interface MemoryKVOptions {
  /** Clock in epoch ms (default `Date.now`). Injectable for tests. */
  now?: () => number;
  /** Sweep interval ms for proactive expiry (default 30s). `0` disables the timer
   *  (entries still expire lazily on access). */
  sweepMs?: number;
}

/** In-process `KV` backed by a `Map`, with TTL (lazy + periodic sweep). The
 *  default store — correct for a single instance, NOT shared across processes. */
export class MemoryKV implements KV {
  #map = new Map<string, Entry>();
  #now: () => number;
  #timer?: ReturnType<typeof setInterval>;

  constructor(opts: MemoryKVOptions = {}) {
    this.#now = opts.now ?? (() => Date.now());
    const sweepMs = opts.sweepMs ?? 30_000;
    if (sweepMs > 0) {
      this.#timer = setInterval(() => this.#sweep(), sweepMs);
      this.#timer.unref?.();
    }
  }

  #live(key: string): Entry | undefined {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== 0 && e.expiresAt <= this.#now()) {
      this.#map.delete(key);
      return undefined;
    }
    return e;
  }

  #sweep(): void {
    const t = this.#now();
    for (const [k, e] of this.#map) if (e.expiresAt !== 0 && e.expiresAt <= t) this.#map.delete(k);
  }

  async get(key: string): Promise<string | undefined> {
    return this.#live(key)?.value;
  }

  async set(key: string, value: string, opts: SetOptions = {}): Promise<void> {
    const expiresAt = opts.ttl ? this.#now() + opts.ttl * 1000 : 0;
    this.#map.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.#map.delete(key);
  }

  async incr(key: string, opts: IncrOptions = {}): Promise<number> {
    const by = opts.by ?? 1;
    const existing = this.#live(key);
    const next = (existing ? Number(existing.value) || 0 : 0) + by;
    // Preserve an existing expiry; only a *new* key gets opts.ttl.
    const expiresAt = existing ? existing.expiresAt : opts.ttl ? this.#now() + opts.ttl * 1000 : 0;
    this.#map.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key: string, ttl: number): Promise<void> {
    const e = this.#live(key);
    if (e) e.expiresAt = this.#now() + ttl * 1000;
  }

  async ttl(key: string): Promise<number> {
    const e = this.#live(key);
    if (!e) return -2;
    if (e.expiresAt === 0) return -1;
    return Math.ceil((e.expiresAt - this.#now()) / 1000);
  }

  async scan(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (const k of this.#map.keys()) if (this.#live(k) && k.startsWith(prefix)) out.push(k);
    return out;
  }

  async close(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#map.clear();
  }

  /** Entries currently held (after lazy/periodic expiry). */
  get size(): number {
    this.#sweep();
    return this.#map.size;
  }
}

/** Wrap a `KV` so every key is transparently prefixed with `ns + ":"`. Lets
 *  several consumers (sessions, rate-limit, cache) share one backend without
 *  colliding. `scan` is prefixed and the namespace is stripped from results. */
export function namespaced(kv: KV, ns: string): KV {
  const p = `${ns}:`;
  const wrapped: KV = {
    get: (k) => kv.get(p + k),
    set: (k, v, o) => kv.set(p + k, v, o),
    delete: (k) => kv.delete(p + k),
    incr: (k, o) => kv.incr(p + k, o),
    expire: (k, t) => kv.expire(p + k, t),
    ttl: (k) => kv.ttl(p + k),
  };
  if (kv.scan) wrapped.scan = async (prefix) => (await kv.scan!(p + prefix)).map((k) => k.slice(p.length));
  if (kv.close) wrapped.close = () => kv.close!();
  return wrapped;
}
