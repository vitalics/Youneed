// ── @youneed/server-plugin-pubsub-kafka — Kafka adapter (Pub/Sub) ────────────
//
// `KafkaPubSub` implements the `PubSub` contract over Kafka topics (a channel = a
// topic). Kafka is a log/streaming system, not a KV store, so this provides pub/sub
// only — pair it with a `KV` adapter (redis/postgres/memory) for state.
//
// Uses the official `kafkajs` (a peer dependency), imported lazily — or inject a
// `kafkajs`-compatible `Kafka` instance, which also makes it testable.

import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

// Minimal kafkajs surface we use.
export interface KafkaProducerLike {
  connect(): Promise<void>;
  send(args: { topic: string; messages: Array<{ value: string }> }): Promise<unknown>;
  disconnect(): Promise<void>;
}
export interface KafkaConsumerLike {
  connect(): Promise<void>;
  subscribe(args: { topic: string; fromBeginning?: boolean }): Promise<void>;
  run(args: { eachMessage(p: { topic: string; message: { value: { toString(): string } | null } }): Promise<void> }): Promise<void>;
  disconnect(): Promise<void>;
}
export interface KafkaLike {
  producer(): KafkaProducerLike;
  consumer(cfg: { groupId: string }): KafkaConsumerLike;
}

export interface KafkaOptions {
  /** Broker list, e.g. `["localhost:9092"]`. Ignored if `kafka` is given. */
  brokers?: string[];
  /** Kafka clientId. */
  clientId?: string;
  /** Consumer groupId prefix (a unique suffix is appended per subscription). */
  groupIdPrefix?: string;
  /** Inject a `kafkajs`-compatible `Kafka` instance (for tests / shared client). */
  kafka?: KafkaLike;
  /** Read a topic from its beginning when subscribing (default false). */
  fromBeginning?: boolean;
}

export class KafkaPubSub implements PubSub {
  readonly name = "kafka";
  #opts: KafkaOptions;
  #kafka?: Promise<KafkaLike>;
  #producer?: Promise<KafkaProducerLike>;
  #consumers = new Set<KafkaConsumerLike>();
  #group = 0;

  constructor(opts: KafkaOptions = {}) {
    this.#opts = opts;
  }

  async #lib(): Promise<KafkaLike> {
    if (this.#opts.kafka) return this.#opts.kafka;
    if (!this.#kafka) {
      this.#kafka = (async () => {
        const { Kafka } = (await import("kafkajs")) as unknown as { Kafka: new (c: { clientId?: string; brokers: string[] }) => KafkaLike };
        return new Kafka({ clientId: this.#opts.clientId ?? "youneed", brokers: this.#opts.brokers ?? ["localhost:9092"] });
      })();
    }
    return this.#kafka;
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.#producer) {
      this.#producer = (async () => {
        const p = (await this.#lib()).producer();
        await p.connect();
        return p;
      })();
    }
    const p = await this.#producer;
    await p.send({ topic: channel, messages: [{ value: message }] });
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    // One consumer per subscription (own group → independent offsets) — simplest correct mapping.
    const groupId = `${this.#opts.groupIdPrefix ?? "youneed"}-${channel}-${++this.#group}`;
    const consumer = (await this.#lib()).consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic: channel, fromBeginning: this.#opts.fromBeginning ?? false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        await handler(message.value ? message.value.toString() : "", topic);
      },
    });
    this.#consumers.add(consumer);
    return {
      close: async () => {
        this.#consumers.delete(consumer);
        await consumer.disconnect();
      },
    };
  }

  async close(): Promise<void> {
    for (const c of this.#consumers) await c.disconnect();
    this.#consumers.clear();
    if (this.#producer) await (await this.#producer).disconnect();
  }
}

export function kafkaPubSub(opts: KafkaOptions = {}): KafkaPubSub {
  return new KafkaPubSub(opts);
}
