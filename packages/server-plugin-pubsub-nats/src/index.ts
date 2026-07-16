// ── @youneed/server-plugin-pubsub-nats — NATS adapter (Pub/Sub) ──────────────
//
// `NatsPubSub` implements the `PubSub` contract over NATS core pub/sub (a channel =
// a NATS subject). NATS core is fire-and-forget messaging, not a KV store, so this
// provides pub/sub only — pair it with a `KV` adapter (redis/postgres/memory) for
// state.
//
// Uses the official `nats` (nats.js, a peer dependency), imported lazily — or inject
// a `nats`-compatible `NatsConnection`, which also makes it testable.

import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

// Minimal nats.js surface we use.
export interface NatsMsgLike {
  data: Uint8Array;
}
export interface NatsSubscriptionLike extends AsyncIterable<NatsMsgLike> {
  unsubscribe(): void;
}
export interface NatsConnectionLike {
  publish(subject: string, data: Uint8Array): void;
  subscribe(subject: string): NatsSubscriptionLike;
  drain(): Promise<void>;
  close(): Promise<void>;
}

export interface NatsOptions {
  /** Server list, e.g. `"localhost:4222"` or `["nats://a:4222"]`. Ignored if `connection` is given. */
  servers?: string | string[];
  /** Inject a `nats`-compatible `NatsConnection` (for tests / shared client). */
  connection?: NatsConnectionLike;
  /** Override the reported `name` (default `"nats"`). */
  name?: string;
}

export class NatsPubSub implements PubSub {
  readonly name: string;
  #opts: NatsOptions;
  #conn?: Promise<NatsConnectionLike>;
  #enc = new TextEncoder();
  #dec = new TextDecoder();
  #subs = new Set<NatsSubscriptionLike>();

  constructor(opts: NatsOptions = {}) {
    this.#opts = opts;
    this.name = opts.name ?? "nats";
  }

  async #connection(): Promise<NatsConnectionLike> {
    if (this.#opts.connection) return this.#opts.connection;
    if (!this.#conn) {
      this.#conn = (async () => {
        const { connect } = (await import("nats")) as unknown as {
          connect: (c: { servers: string | string[] }) => Promise<NatsConnectionLike>;
        };
        return connect({ servers: this.#opts.servers ?? "localhost:4222" });
      })();
    }
    return this.#conn;
  }

  async publish(channel: string, message: string): Promise<void> {
    const nc = await this.#connection();
    nc.publish(channel, this.#enc.encode(message));
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    const nc = await this.#connection();
    const sub = nc.subscribe(channel);
    this.#subs.add(sub);
    // Consume the subscription's async iterator; TextDecoder keeps us codec-agnostic.
    void (async () => {
      for await (const m of sub) await handler(this.#dec.decode(m.data), channel);
    })();
    return {
      close: () => {
        this.#subs.delete(sub);
        sub.unsubscribe();
      },
    };
  }

  async close(): Promise<void> {
    for (const s of this.#subs) s.unsubscribe();
    this.#subs.clear();
    if (this.#conn) await (await this.#conn).drain();
  }
}

export function natsPubSub(opts: NatsOptions = {}): NatsPubSub {
  return new NatsPubSub(opts);
}
