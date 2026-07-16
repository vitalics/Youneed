# @youneed/server-plugin-pubsub-nats

NATS transport for [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
**`NatsPubSub`** implements the `PubSub` contract over NATS core pub/sub — a channel
maps to a NATS subject. NATS core is fire-and-forget messaging, not a KV store, so
this adapter is **pub/sub only**; pair it with a KV adapter (Redis / Postgres /
Memory) for state.

Uses the official [`nats`](https://www.npmjs.com/package/nats) (nats.js), an
**optional peer dependency** — install it yourself (`npm i nats`). The library is
imported lazily; you can also inject a `nats`-compatible `NatsConnection`.

Run a local NATS server with Docker:

```sh
docker run -p 4222:4222 nats
```

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { natsPubSub } from "@youneed/server-plugin-pubsub-nats";

// Wire the adapter into the core pubsub plugin.
const bus = createPubSub(
  natsPubSub({ servers: "localhost:4222" }),
);

Application().plugin(pubsub(bus)).listen(3000, () => {});

// channel === NATS subject. handler receives (message, subject).
await bus.subscribe("orders", (message, subject) => {
  console.log(`[${subject}]`, JSON.parse(message));
});
await bus.publish("orders", JSON.stringify({ id: 42 }));
```

Every `subscribe` opens its own NATS subscription and consumes its async iterator,
decoding each `Msg.data` (a `Uint8Array`) with a `TextDecoder` so it stays
codec-agnostic. `Subscription.close` calls `sub.unsubscribe()`; `close()` drains
the connection.

## API

- **`natsPubSub(opts?)`** → `NatsPubSub` (a `PubSub`, `name: "nats"`).
- **`NatsOptions`**:
  - `servers` — server list, e.g. `"localhost:4222"` or `["nats://a:4222"]`
    (default `"localhost:4222"`; ignored if `connection` given).
  - `connection` — inject a `nats`-compatible `NatsConnection` (shared client / tests).
  - `name` — override the reported adapter name (default `"nats"`).

Pair this adapter with the core plugin for the devtools view — see
[`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
