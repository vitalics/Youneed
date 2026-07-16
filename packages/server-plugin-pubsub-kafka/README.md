# @youneed/server-plugin-pubsub-kafka

Kafka transport for [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
**`KafkaPubSub`** implements the `PubSub` contract over Kafka topics — a channel
maps to a topic. Kafka is a log/streaming system, not a KV store, so this adapter
is **pub/sub only**; pair it with a KV adapter (Redis / Postgres / Memory) for
state.

Uses the official [`kafkajs`](https://www.npmjs.com/package/kafkajs), an **optional
peer dependency** — install it yourself (`npm i kafkajs`). The library is imported
lazily; you can also inject a `kafkajs`-compatible `Kafka` instance.

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { kafkaPubSub } from "@youneed/server-plugin-pubsub-kafka";

// Wire the adapter into the core pubsub plugin.
const bus = createPubSub(
  kafkaPubSub({ clientId: "orders-svc", brokers: ["localhost:9092"] }),
);

Application().plugin(pubsub(bus)).listen(3000, () => {});

// channel === Kafka topic. handler receives (message, topic).
await bus.subscribe("orders", (message, topic) => {
  console.log(`[${topic}]`, JSON.parse(message));
});
await bus.publish("orders", JSON.stringify({ id: 42 }));
```

Each `subscribe` spins up its own consumer with a unique `groupId`, so every
subscription gets its own offsets (a broadcast, not a shared work queue).

## API

- **`kafkaPubSub(opts?)`** → `KafkaPubSub` (a `PubSub`, `name: "kafka"`).
- **`KafkaOptions`**:
  - `brokers` — broker list, e.g. `["localhost:9092"]` (ignored if `kafka` given).
  - `clientId` — Kafka clientId (default `"youneed"`).
  - `groupIdPrefix` — consumer group prefix; a unique suffix is appended per
    subscription (default `"youneed"`).
  - `fromBeginning` — read a topic from its start when subscribing (default `false`).
  - `kafka` — inject a `kafkajs`-compatible `Kafka` instance (shared client / tests).

Pair this adapter with the core plugin for the devtools view — see
[`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
