// Run: pnpm --filter @youneed/server-plugin-pubsub-rabbitmq test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { RabbitMQPubSub, type AmqpConnectionLike, type AmqpChannelLike } from "../src/index.ts";

// A recording fake channel. It logs every call and, on `publish`, immediately
// drives the message through every consumer whose bound routing key matches the
// publish key (a `topic`/`fanout` broadcast). One channel per connection.
interface Rec {
  assertExchange: Array<{ exchange: string; type: string }>;
  assertQueue: number;
  bindQueue: Array<{ queue: string; exchange: string; pattern: string }>;
  publish: Array<{ exchange: string; routingKey: string; content: string }>;
  ack: number;
  cancel: string[];
  deleteQueue: string[];
  closed: boolean;
}

function fakeConnection(): { conn: AmqpConnectionLike; rec: Rec } {
  const rec: Rec = {
    assertExchange: [],
    assertQueue: 0,
    bindQueue: [],
    publish: [],
    ack: 0,
    cancel: [],
    deleteQueue: [],
    closed: false,
  };
  // key -> list of consumer callbacks bound to it
  const binds = new Map<string, Array<(msg: { content: { toString(): string } } | null) => void>>();
  const queues = new Map<string, string>(); // queue -> bound routing key
  let queueSeq = 0;
  let tagSeq = 0;

  const channel: AmqpChannelLike = {
    async assertExchange(exchange, type) {
      rec.assertExchange.push({ exchange, type });
      return {};
    },
    async assertQueue() {
      rec.assertQueue++;
      return { queue: `q-${++queueSeq}` };
    },
    async bindQueue(queue, exchange, pattern) {
      rec.bindQueue.push({ queue, exchange, pattern });
      queues.set(queue, pattern);
      return {};
    },
    publish(exchange, routingKey, content) {
      rec.publish.push({ exchange, routingKey, content: Buffer.from(content).toString() });
      for (const cb of binds.get(routingKey) ?? []) cb({ content: { toString: () => Buffer.from(content).toString() } });
      return true;
    },
    async consume(queue, onMessage) {
      const key = queues.get(queue) ?? "";
      (binds.get(key) ?? binds.set(key, []).get(key)!).push(onMessage);
      return { consumerTag: `ct-${++tagSeq}` };
    },
    ack() {
      rec.ack++;
    },
    async cancel(consumerTag) {
      rec.cancel.push(consumerTag);
      return {};
    },
    async deleteQueue(queue) {
      rec.deleteQueue.push(queue);
      const key = queues.get(queue);
      if (key !== undefined) binds.delete(key);
      return {};
    },
    async close() {
      rec.closed = true;
    },
  };

  const conn: AmqpConnectionLike = {
    async createChannel() {
      return channel;
    },
    async close() {},
  };
  return { conn, rec };
}

class RabbitSuite extends Test({ name: "server-plugin-pubsub-rabbitmq" }) {
  @Test.it('name is "rabbitmq"') async named() {
    expect(new RabbitMQPubSub().name === "rabbitmq").toBeTruthy();
  }

  @Test.it("publish routes to (exchange, channel) with the message") async routes() {
    const { conn, rec } = fakeConnection();
    const bus = new RabbitMQPubSub({ connection: conn, exchange: "youneed" });
    await bus.publish("events", "user.created");
    await bus.close();
    expect(rec.publish.length === 1).toBeTruthy();
    expect(rec.publish[0].exchange === "youneed").toBeTruthy();
    expect(rec.publish[0].routingKey === "events").toBeTruthy();
    expect(rec.publish[0].content === "user.created").toBeTruthy();
    // the topic exchange was asserted
    expect(rec.assertExchange.some((e) => e.exchange === "youneed" && e.type === "topic")).toBeTruthy();
  }

  @Test.it("subscribe binds a queue to the channel routing key and delivers to the handler") async delivers() {
    const { conn, rec } = fakeConnection();
    const bus = new RabbitMQPubSub({ connection: conn });
    const got: string[] = [];
    await bus.subscribe("events", (m, ch) => void got.push(`${ch}:${m}`));
    // a queue was asserted and bound to the "events" routing key
    expect(rec.assertQueue === 1).toBeTruthy();
    expect(rec.bindQueue.length === 1 && rec.bindQueue[0].pattern === "events").toBeTruthy();
    await bus.publish("events", "hello");
    await bus.close();
    expect(got.length === 1 && got[0] === "events:hello").toBeTruthy();
    expect(rec.ack === 1).toBeTruthy();
  }

  @Test.it("only subscribers of the channel receive it") async isolation() {
    const { conn } = fakeConnection();
    const bus = new RabbitMQPubSub({ connection: conn });
    const a: string[] = [];
    const b: string[] = [];
    await bus.subscribe("chan-a", (m) => void a.push(m));
    await bus.subscribe("chan-b", (m) => void b.push(m));
    await bus.publish("chan-a", "only-a");
    await bus.close();
    expect(a.length === 1 && a[0] === "only-a" && b.length === 0).toBeTruthy();
  }

  @Test.it("Subscription.close cancels the consumer and deletes the queue") async close() {
    const { conn, rec } = fakeConnection();
    const bus = new RabbitMQPubSub({ connection: conn });
    const sub = await bus.subscribe("events", () => {});
    await sub.close();
    expect(rec.cancel.length === 1).toBeTruthy();
    expect(rec.deleteQueue.length === 1).toBeTruthy();
    await bus.close();
  }
}

await TestApplication().addTests(RabbitSuite).reporter(new ConsoleReporter()).run();
