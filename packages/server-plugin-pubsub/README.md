# @youneed/server-plugin-pubsub

Backend-agnostic **publish/subscribe** for [`@youneed/server`](../server) — the
same shape `@youneed/server-plugin-store` gives KV. You code against one `PubSub`
contract (`publish`/`subscribe`, messages are strings) and pick the transport via
an adapter: in-process `MemoryPubSub` (built-in), or Redis / Postgres / Deno /
Kafka through a sibling adapter package.

`pubsub(bus)` is a `ServerPlugin`: it mounts small introspection routes and, when
[`@youneed/server-plugin-devtools`](../server-plugin-devtools) is present, surfaces
a **Pub/Sub node on the flow graph**, its own header tab, and a "send a message"
panel. The package also re-exports `@youneed/server-plugin-store` (KV contract +
`MemoryKV`) for convenience.

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";

// Wrap a backend (default = in-process MemoryPubSub) in a tracker for devtools.
const bus = createPubSub();

const app = Application()
  .plugin(pubsub(bus)) // exposes /__pubsub/channels + /__pubsub/publish, and inspect()
  .listen(3000, () => {});

// Subscribe — handler receives (message, channel). Messages are strings, so serialize.
const sub = await bus.subscribe("orders", (message, channel) => {
  const order = JSON.parse(message);
  console.log(`[${channel}]`, order.id);
});

// Publish from anywhere (a handler, a job, …).
await bus.publish("orders", JSON.stringify({ id: 42 }));

// Later: stop delivery.
await sub.close();
```

## Using a real transport

`createPubSub(backend)` wraps any `PubSub` implementation in a `TrackedPubSub` so
its traffic shows up in devtools. Pass an adapter as the backend:

```ts
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { postgresPubSub } from "@youneed/server-plugin-pubsub-postgres";

const bus = createPubSub(postgresPubSub({ connectionString: process.env.DATABASE_URL }));
Application().plugin(pubsub(bus)).listen(3000, () => {});
```

Adapters (each implements the `PubSub` contract):

- [`@youneed/server-plugin-pubsub-postgres`](../server-plugin-pubsub-postgres) — `LISTEN`/`NOTIFY` (+ KV table)
- [`@youneed/server-plugin-pubsub-kafka`](../server-plugin-pubsub-kafka) — Kafka topics (pub/sub only)
- [`@youneed/server-plugin-pubsub-deno`](../server-plugin-pubsub-deno) — Deno KV queues (+ KV)
- [`@youneed/server-plugin-pubsub-rabbitmq`](../server-plugin-pubsub-rabbitmq) — AMQP topic exchange (`amqplib`)
- [`@youneed/server-plugin-pubsub-nats`](../server-plugin-pubsub-nats) — NATS subjects (`nats`)
- [`@youneed/server-plugin-pubsub-sqs`](../server-plugin-pubsub-sqs) — AWS SQS queue-per-channel, long-poll (SigV4, no SDK)

## API

- **`pubsub(bus, opts?)`** → `ServerPlugin`. `bus` must be a `TrackedPubSub`. Mounts
  `GET {basePath}/channels` and `POST {basePath}/publish` (`{ channel, message }`),
  and reports an `inspect()` payload (`kind: "pubsub"`) for devtools.
  - `basePath` — internal route prefix (default `"/__pubsub"`).
  - `exposeDevtools` — mount the introspection + publish routes (default `true`).
- **`createPubSub(backend?, opts?)`** → `TrackedPubSub`. Wraps `backend` (default
  `MemoryPubSub`) in tracking. `opts.recent` — ring-buffer size of recent messages
  kept per channel (default `25`).
- **`TrackedPubSub`** — a `PubSub` that records per-channel counts/subscribers/recent
  messages. `.channels()` returns the activity snapshot. Pass the **same** instance
  to `pubsub(...)` and your handlers so all traffic is tracked.
- **`MemoryPubSub`** — in-process `PubSub`, fine for a single instance / dev.

### The `PubSub` contract

```ts
interface PubSub {
  readonly name?: string; // adapter name, shown in devtools
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: Subscriber): Promise<Subscription>;
  close?(): Promise<void>;
}
type Subscriber = (message: string, channel: string) => void | Promise<void>;
interface Subscription { close(): void | Promise<void>; }
```

Also exported: `ChannelStat`, `PubSubInspect`, `PubSubPluginOptions`, and everything
from `@youneed/server-plugin-store`.
