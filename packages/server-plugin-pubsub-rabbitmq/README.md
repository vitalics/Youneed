# @youneed/server-plugin-pubsub-rabbitmq

RabbitMQ transport for [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
**`RabbitMQPubSub`** implements the `PubSub` contract over an AMQP exchange — a
channel maps to a routing key on a shared `topic` exchange. RabbitMQ is a broker,
not a KV store, so this adapter is **pub/sub only**; pair it with a KV adapter
(Redis / Postgres / Memory) for state.

Uses the official [`amqplib`](https://www.npmjs.com/package/amqplib), an **optional
peer dependency** — install it yourself (`npm i amqplib`). The library is imported
lazily; you can also inject an `amqplib`-compatible connection.

Run a broker locally:

```sh
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
# management UI at http://localhost:15672 (guest / guest)
```

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { rabbitmqPubSub } from "@youneed/server-plugin-pubsub-rabbitmq";

// Wire the adapter into the core pubsub plugin.
const bus = createPubSub(
  rabbitmqPubSub({ url: "amqp://localhost", exchange: "orders-svc" }),
);

Application().plugin(pubsub(bus)).listen(3000, () => {});

// channel === routing key on the exchange. handler receives (message, channel).
await bus.subscribe("orders", (message, channel) => {
  console.log(`[${channel}]`, JSON.parse(message));
});
await bus.publish("orders", JSON.stringify({ id: 42 }));
```

Each `subscribe` asserts an exclusive, auto-delete queue bound to the channel's
routing key, so every subscription gets its own broadcast tap (a fan-out, not a
shared work queue). `Subscription.close` cancels the consumer and deletes the
queue; `close()` tears down the channel and connection.

## API

- **`rabbitmqPubSub(opts?)`** → `RabbitMQPubSub` (a `PubSub`, `name: "rabbitmq"`).
- **`RabbitMQOptions`**:
  - `url` — AMQP URL (default `"amqp://localhost"`; ignored if `connection` given).
  - `exchange` — exchange to publish/bind through (default `"youneed"`).
  - `exchangeType` — `"topic"` (default) or `"fanout"`.
  - `connection` — inject an `amqplib`-compatible connection (shared client / tests).

Pair this adapter with the core plugin for the devtools view — see
[`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
