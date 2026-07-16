// Run: pnpm --filter @youneed/server-plugin-pubsub-kafka test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { KafkaPubSub, type KafkaLike } from "../src/index.ts";

// A fake kafkajs `Kafka`: an in-memory broker where producer.send fans a message
// out to every running consumer subscribed to that topic.
function fakeKafka(): KafkaLike {
  const consumers = new Map<string, Array<(p: { topic: string; message: { value: { toString(): string } } }) => Promise<void>>>();
  return {
    producer() {
      return {
        async connect() {},
        async disconnect() {},
        async send({ topic, messages }) {
          for (const m of messages) for (const run of consumers.get(topic) ?? []) await run({ topic, message: { value: m.value } });
          return [];
        },
      };
    },
    consumer() {
      let topic = "";
      return {
        async connect() {},
        async disconnect() {
          const arr = consumers.get(topic);
          if (arr) arr.length = 0;
        },
        async subscribe(args) {
          topic = args.topic;
        },
        async run(args) {
          (consumers.get(topic) ?? consumers.set(topic, []).get(topic)!).push(args.eachMessage);
        },
      };
    },
  };
}

class KafkaSuite extends Test({ name: "server-plugin-pubsub-kafka" }) {
  @Test.it("publish to a topic reaches the subscriber") async roundtrip() {
    const bus = new KafkaPubSub({ kafka: fakeKafka() });
    const got: string[] = [];
    await bus.subscribe("events", (m, ch) => void got.push(`${ch}:${m}`));
    await bus.publish("events", "user.created");
    await bus.close();
    expect(got[0] === "events:user.created").toBeTruthy();
  }

  @Test.it("only subscribers of the topic receive it") async isolation() {
    const bus = new KafkaPubSub({ kafka: fakeKafka() });
    const a: string[] = [];
    const b: string[] = [];
    await bus.subscribe("topic-a", (m) => void a.push(m));
    await bus.subscribe("topic-b", (m) => void b.push(m));
    await bus.publish("topic-a", "only-a");
    await bus.close();
    expect(a.length === 1 && a[0] === "only-a" && b.length === 0).toBeTruthy();
  }
}

await TestApplication().addTests(KafkaSuite).reporter(new ConsoleReporter()).run();
