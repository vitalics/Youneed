// ── @youneed/server-plugin-pubsub-deno — Deno KV adapter (KV + Pub/Sub) ──────
//
//   • DenoKV     — the `KV` store contract over `Deno.openKv()`.
//   • DenoPubSub — the `PubSub` contract over Deno KV **queues** (enqueue / listenQueue).
//
// Runs on the Deno runtime (or Deno Deploy). In Node there is no `Deno` global, so
// inject a `Deno.Kv`-compatible object (also how the tests run). NOTE: Deno KV
// queues are an at-least-once WORK queue, not cross-isolate broadcast — within one
// isolate every local subscriber of a channel is fanned out to.
//   https://docs.deno.com/deploy/reference/deno_kv/

import type { KV, IncrOptions, SetOptions } from "@youneed/server-plugin-store";
import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

/** The minimal `Deno.Kv` surface we use. */
export interface DenoKvLike {
  get(key: unknown[]): Promise<{ value: unknown; versionstamp: string | null }>;
  set(key: unknown[], value: unknown, opts?: { expireIn?: number }): Promise<{ ok: boolean }>;
  delete(key: unknown[]): Promise<void>;
  list(selector: { prefix: unknown[] }): AsyncIterable<{ key: unknown[]; value: unknown }>;
  atomic(): {
    check(...checks: { key: unknown[]; versionstamp: string | null }[]): ReturnType<DenoKvLike["atomic"]>;
    set(key: unknown[], value: unknown, opts?: { expireIn?: number }): ReturnType<DenoKvLike["atomic"]>;
    commit(): Promise<{ ok: boolean }>;
  };
  enqueue(value: unknown, opts?: { delay?: number }): Promise<{ ok: boolean }>;
  listenQueue(handler: (value: unknown) => void | Promise<void>): void;
}

export interface DenoOptions {
  /** Inject a `Deno.Kv` (for tests / a shared handle). Defaults to `Deno.openKv()`. */
  kv?: DenoKvLike;
  /** Key prefix segment for KV entries (default `"kv"`). */
  prefix?: string;
}

async function openKv(opts: DenoOptions): Promise<DenoKvLike> {
  if (opts.kv) return opts.kv;
  const D = (globalThis as { Deno?: { openKv(): Promise<DenoKvLike> } }).Deno;
  if (!D?.openKv) throw new Error("DenoKV: no `Deno.openKv` — run on Deno, or pass `{ kv }`.");
  return D.openKv();
}

interface Stored {
  v: string;
  e?: number;
} // value + optional epoch-ms expiry

// ── KV ──────────────────────────────────────────────────────────────────────
export class DenoKV implements KV {
  #ready: Promise<DenoKvLike>;
  #prefix: string;
  #now: () => number;

  constructor(opts: DenoOptions & { now?: () => number } = {}) {
    this.#prefix = opts.prefix ?? "kv";
    this.#now = opts.now ?? (() => Date.now());
    this.#ready = openKv(opts);
  }

  #key(key: string) {
    return [this.#prefix, key];
  }

  async get(key: string): Promise<string | undefined> {
    const kv = await this.#ready;
    const e = (await kv.get(this.#key(key))).value as Stored | null;
    if (!e) return undefined;
    if (e.e !== undefined && e.e <= this.#now()) return undefined;
    return e.v;
  }

  async set(key: string, value: string, opts: SetOptions = {}): Promise<void> {
    const kv = await this.#ready;
    const stored: Stored = { v: value };
    if (opts.ttl !== undefined) stored.e = this.#now() + opts.ttl * 1000;
    await kv.set(this.#key(key), stored, opts.ttl !== undefined ? { expireIn: opts.ttl * 1000 } : undefined);
  }

  async delete(key: string): Promise<void> {
    const kv = await this.#ready;
    await kv.delete(this.#key(key));
  }

  async incr(key: string, opts: IncrOptions = {}): Promise<number> {
    const kv = await this.#ready;
    const by = opts.by ?? 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cur = await kv.get(this.#key(key));
      const prev = cur.value as Stored | null;
      const live = prev && (prev.e === undefined || prev.e > this.#now());
      const next = (live ? Number(prev!.v) : 0) + by;
      const stored: Stored = { v: String(next) };
      const expireIn = !live && opts.ttl !== undefined ? opts.ttl * 1000 : undefined;
      if (expireIn !== undefined) stored.e = this.#now() + expireIn;
      else if (live && prev!.e !== undefined) stored.e = prev!.e;
      const res = await kv.atomic().check({ key: this.#key(key), versionstamp: live ? cur.versionstamp : null }).set(this.#key(key), stored, expireIn !== undefined ? { expireIn } : undefined).commit();
      if (res.ok) return next;
    }
    throw new Error("DenoKV: incr contention — too many retries");
  }

  async expire(key: string, ttl: number): Promise<void> {
    const v = await this.get(key);
    if (v !== undefined) await this.set(key, v, { ttl });
  }

  async ttl(key: string): Promise<number> {
    const kv = await this.#ready;
    const e = (await kv.get(this.#key(key))).value as Stored | null;
    if (!e) return -2;
    if (e.e === undefined) return -1;
    return Math.max(0, Math.floor((e.e - this.#now()) / 1000));
  }

  async scan(prefix: string): Promise<string[]> {
    const kv = await this.#ready;
    const out: string[] = [];
    for await (const entry of kv.list({ prefix: [this.#prefix] })) {
      const k = entry.key[entry.key.length - 1] as string;
      if (k.startsWith(prefix)) out.push(k);
    }
    return out;
  }
}

export function denoKV(opts: DenoOptions = {}): DenoKV {
  return new DenoKV(opts);
}

// ── Pub/Sub (Deno KV queues) ────────────────────────────────────────────────────
interface QueueMsg {
  __pubsub: true;
  channel: string;
  message: string;
}

export class DenoPubSub implements PubSub {
  readonly name = "deno";
  #ready: Promise<DenoKvLike>;
  #handlers = new Map<string, Set<Subscriber>>();
  #listening = false;

  constructor(opts: DenoOptions = {}) {
    this.#ready = openKv(opts).then((kv) => {
      kv.listenQueue((value) => {
        const m = value as QueueMsg;
        if (!m || m.__pubsub !== true) return;
        const set = this.#handlers.get(m.channel);
        if (set) for (const h of [...set]) void h(m.message, m.channel);
      });
      this.#listening = true;
      return kv;
    });
  }

  async publish(channel: string, message: string): Promise<void> {
    const kv = await this.#ready;
    await kv.enqueue({ __pubsub: true, channel, message } satisfies QueueMsg);
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    await this.#ready; // ensure listenQueue is wired
    let set = this.#handlers.get(channel);
    if (!set) this.#handlers.set(channel, (set = new Set()));
    set.add(handler);
    return {
      close: () => {
        const s = this.#handlers.get(channel);
        if (s) {
          s.delete(handler);
          if (s.size === 0) this.#handlers.delete(channel);
        }
      },
    };
  }
}

export function denoPubSub(opts: DenoOptions = {}): DenoPubSub {
  return new DenoPubSub(opts);
}
