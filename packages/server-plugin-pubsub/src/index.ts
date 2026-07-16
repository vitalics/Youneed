// ── @youneed/server-plugin-pubsub — publish/subscribe messaging ──────────────
//
// A backend-agnostic pub/sub contract (like @youneed/server-plugin-store is for
// KV). The transport is chosen by adapter:
//   • MemoryPubSub  (built-in)                    → in-process, single instance.
//   • RedisPubSub   (server-plugin-pubsub-redis)  → Redis SUBSCRIBE/PUBLISH.
//   • …-postgres (LISTEN/NOTIFY), …-deno (queues), …-kafka (topics).
//
// `pubsub(bus)` is a ServerPlugin: it tracks channel activity and — when
// `@youneed/server-plugin-devtools` is mounted — surfaces a Pub/Sub node on the
// flow graph, its own header tab, and a "send a message" panel (via `inspect()` +
// internal routes). Re-exports the KV store for convenience.

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";

export * from "@youneed/server-plugin-store"; // KV contract + MemoryKV, for convenience

/** A subscriber callback — receives the raw message + the channel it arrived on. */
export type Subscriber = (message: string, channel: string) => void | Promise<void>;

/** A live subscription; `close()` stops delivery. */
export interface Subscription {
  close(): void | Promise<void>;
}

/** A publish/subscribe transport. Messages are strings — callers serialize (JSON…). */
export interface PubSub {
  /** Adapter name (memory / redis / postgres / …) — shown in devtools. */
  readonly name?: string;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: Subscriber): Promise<Subscription>;
  /** Release any underlying resources (sockets). Optional. */
  close?(): Promise<void>;
}

/** In-process pub/sub — fine for a single instance / dev. */
export class MemoryPubSub implements PubSub {
  readonly name = "memory";
  #subs = new Map<string, Set<Subscriber>>();

  async publish(channel: string, message: string): Promise<void> {
    const set = this.#subs.get(channel);
    if (!set) return;
    for (const handler of [...set]) await handler(message, channel);
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    let set = this.#subs.get(channel);
    if (!set) this.#subs.set(channel, (set = new Set()));
    set.add(handler);
    return {
      close: () => {
        set!.delete(handler);
        if (set!.size === 0) this.#subs.delete(channel);
      },
    };
  }
}

/** Per-channel activity, surfaced to devtools. */
export interface ChannelStat {
  channel: string;
  published: number;
  delivered: number;
  subscribers: number;
  recent: Array<{ at: number; message: string }>;
}

/**
 * Wrap a {@link PubSub} to record activity (counts, live subscriber tallies, a
 * ring buffer of recent messages per channel) for the devtools view. Pass the
 * SAME instance to `pubsub(...)` and to your handlers so all traffic is tracked.
 */
export class TrackedPubSub implements PubSub {
  readonly #backend: PubSub;
  readonly #recentMax: number;
  readonly #stats = new Map<string, ChannelStat>();

  constructor(backend: PubSub = new MemoryPubSub(), opts: { recent?: number } = {}) {
    this.#backend = backend;
    this.#recentMax = opts.recent ?? 25;
  }

  get name() {
    return this.#backend.name;
  }

  #stat(channel: string): ChannelStat {
    let s = this.#stats.get(channel);
    if (!s) this.#stats.set(channel, (s = { channel, published: 0, delivered: 0, subscribers: 0, recent: [] }));
    return s;
  }

  async publish(channel: string, message: string): Promise<void> {
    const s = this.#stat(channel);
    s.published += 1;
    s.recent.push({ at: Date.now(), message });
    if (s.recent.length > this.#recentMax) s.recent.shift();
    await this.#backend.publish(channel, message);
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    const s = this.#stat(channel);
    s.subscribers += 1;
    const sub = await this.#backend.subscribe(channel, (msg, ch) => {
      this.#stat(ch).delivered += 1;
      return handler(msg, ch);
    });
    return {
      close: async () => {
        s.subscribers = Math.max(0, s.subscribers - 1);
        await sub.close();
      },
    };
  }

  async close(): Promise<void> {
    await this.#backend.close?.();
  }

  /** Snapshot of all channel activity. */
  channels(): ChannelStat[] {
    return [...this.#stats.values()].map((s) => ({ ...s, recent: [...s.recent] }));
  }
}

export interface PubSubPluginOptions {
  /** Internal route prefix (default `"/__pubsub"`). */
  basePath?: string;
  /** Mount the devtools introspection + publish routes (default true). */
  exposeDevtools?: boolean;
}

/** The `inspect()` payload — devtools detects pub/sub by `kind === "pubsub"`. */
export interface PubSubInspect {
  kind: "pubsub";
  backend: string;
  channels: ChannelStat[];
  endpoints: { channels: string; publish: string };
}

/**
 * Mount pub/sub introspection as a ServerPlugin. Pass a {@link TrackedPubSub}
 * (wrap your real backend with it). Exposes `GET {basePath}/channels` and
 * `POST {basePath}/publish {channel,message}`, and an `inspect()` so devtools can
 * draw the flow-graph node, header tab and message-sender.
 */
export function pubsub(bus: TrackedPubSub, opts: PubSubPluginOptions = {}): ServerPlugin {
  const basePath = (opts.basePath ?? "/__pubsub").replace(/\/$/, "");
  const endpoints = { channels: `${basePath}/channels`, publish: `${basePath}/publish` };

  return {
    name: "pubsub",
    setup(app) {
      if (opts.exposeDevtools === false) return;
      app.get(endpoints.channels, () => Response.json({ backend: bus.name ?? "unknown", channels: bus.channels() }));
      app.post(endpoints.publish, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { channel?: string; message?: string };
        if (!body.channel || typeof body.message !== "string") {
          return Response.json({ error: "channel and message are required" }, { status: 400 });
        }
        await bus.publish(body.channel, body.message);
        return Response.json({ ok: true });
      });
    },
    inspect(): PubSubInspect {
      return { kind: "pubsub", backend: bus.name ?? "unknown", channels: bus.channels(), endpoints };
    },
  };
}

/** Convenience: a {@link TrackedPubSub} around `backend` (default in-process). */
export function createPubSub(backend?: PubSub, opts?: { recent?: number }): TrackedPubSub {
  return new TrackedPubSub(backend, opts);
}
