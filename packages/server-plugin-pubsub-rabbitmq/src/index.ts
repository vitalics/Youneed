// ── @youneed/server-plugin-pubsub-rabbitmq — RabbitMQ adapter (Pub/Sub) ──────
//
// `RabbitMQPubSub` implements the `PubSub` contract over an AMQP exchange. A
// channel maps to a routing key on a shared `topic` exchange (or `fanout`), so a
// message published to a channel fans out to every queue bound to that key.
// RabbitMQ is a broker, not a KV store, so this provides pub/sub only — pair it
// with a `KV` adapter (redis/postgres/memory) for state.
//
// Uses the official `amqplib` (an optional peer dependency), imported lazily — or
// inject an `amqplib`-compatible connection, which also makes it testable.

import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

// ── minimal amqplib surface we use ────────────────────────────────────────────

/** The `Channel` surface (`amqplib` `Channel` / `ConfirmChannel`). */
export interface AmqpChannelLike {
  assertExchange(exchange: string, type: string, opts?: { durable?: boolean }): Promise<unknown>;
  assertQueue(queue: string, opts?: { exclusive?: boolean; autoDelete?: boolean }): Promise<{ queue: string }>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<unknown>;
  publish(exchange: string, routingKey: string, content: Uint8Array): boolean;
  consume(
    queue: string,
    onMessage: (msg: { content: { toString(): string } } | null) => void,
    opts?: { noAck?: boolean },
  ): Promise<{ consumerTag: string }>;
  ack(msg: { content: { toString(): string } }): void;
  cancel(consumerTag: string): Promise<unknown>;
  deleteQueue(queue: string): Promise<unknown>;
  close(): Promise<void>;
}

/** The `Connection` surface (`amqplib` `Connection`). */
export interface AmqpConnectionLike {
  createChannel(): Promise<AmqpChannelLike>;
  close(): Promise<void>;
}

export interface RabbitMQOptions {
  /** AMQP URL (default `"amqp://localhost"`). Ignored if `connection` is given. */
  url?: string;
  /** Exchange name to publish/bind through (default `"youneed"`). */
  exchange?: string;
  /** Exchange type — `"topic"` (default) or `"fanout"`. */
  exchangeType?: "topic" | "fanout";
  /** Inject an `amqplib`-compatible connection (for tests / a shared connection). */
  connection?: AmqpConnectionLike;
}

export class RabbitMQPubSub implements PubSub {
  readonly name = "rabbitmq";
  #opts: RabbitMQOptions;
  #exchange: string;
  #exchangeType: string;
  #conn?: Promise<AmqpConnectionLike>;
  #chan?: Promise<AmqpChannelLike>;

  constructor(opts: RabbitMQOptions = {}) {
    this.#opts = opts;
    this.#exchange = opts.exchange ?? "youneed";
    this.#exchangeType = opts.exchangeType ?? "topic";
  }

  async #connection(): Promise<AmqpConnectionLike> {
    if (this.#opts.connection) return this.#opts.connection;
    if (!this.#conn) {
      this.#conn = (async () => {
        const amqp = (await import("amqplib")) as unknown as {
          connect(url: string): Promise<AmqpConnectionLike>;
        };
        return amqp.connect(this.#opts.url ?? "amqp://localhost");
      })();
    }
    return this.#conn;
  }

  // A single shared channel: the exchange is asserted once, lazily.
  async #channel(): Promise<AmqpChannelLike> {
    if (!this.#chan) {
      this.#chan = (async () => {
        const ch = await (await this.#connection()).createChannel();
        await ch.assertExchange(this.#exchange, this.#exchangeType, { durable: false });
        return ch;
      })();
    }
    return this.#chan;
  }

  async publish(channel: string, message: string): Promise<void> {
    const ch = await this.#channel();
    ch.publish(this.#exchange, channel, Buffer.from(message));
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    const ch = await this.#channel();
    // Exclusive, auto-delete queue bound to the channel routing key — its own
    // broadcast tap (a fanout to every subscriber), not a shared work queue.
    const { queue } = await ch.assertQueue("", { exclusive: true, autoDelete: true });
    await ch.bindQueue(queue, this.#exchange, channel);
    const { consumerTag } = await ch.consume(queue, (msg) => {
      if (!msg) return;
      void handler(msg.content.toString(), channel);
      ch.ack(msg);
    });
    return {
      close: async () => {
        await ch.cancel(consumerTag);
        await ch.deleteQueue(queue);
      },
    };
  }

  async close(): Promise<void> {
    if (this.#chan) await (await this.#chan).close();
    if (this.#conn) await (await this.#conn).close();
  }
}

export function rabbitmqPubSub(opts: RabbitMQOptions = {}): RabbitMQPubSub {
  return new RabbitMQPubSub(opts);
}
