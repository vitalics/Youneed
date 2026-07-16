# @youneed/server-plugin-pubsub-deno

Deno KV transport for [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub)
(and the KV side of [`@youneed/server-plugin-store`](../server-plugin-store)):

- **`DenoPubSub`** — the `PubSub` contract over Deno KV **queues** (`enqueue` / `listenQueue`).
- **`DenoKV`** — the `KV` contract over `Deno.openKv()`.

Runs on the **Deno** runtime (or Deno Deploy). On Deno the `Deno.openKv()` global
is used automatically; under Node there is no `Deno` global, so inject a
`Deno.Kv`-compatible handle via `{ kv }` (also how the tests run). Note Deno KV
queues are an at-least-once **work** queue, not cross-isolate broadcast — within one
isolate every local subscriber of a channel is fanned out to.

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { denoPubSub } from "@youneed/server-plugin-pubsub-deno";

// Wire the adapter into the core pubsub plugin.
const bus = createPubSub(denoPubSub()); // uses Deno.openKv()

Application().plugin(pubsub(bus)).listen(3000, () => {});

await bus.subscribe("orders", (message, channel) => {
  console.log(`[${channel}]`, JSON.parse(message));
});
await bus.publish("orders", JSON.stringify({ id: 42 }));
```

KV (sessions, rate-limit, distributed cache) over the same store:

```ts
import { denoKV } from "@youneed/server-plugin-pubsub-deno";

const kv = denoKV({ prefix: "kv" });
await kv.set("hits", "1", { ttl: 60 });
await kv.incr("hits");
```

## API

- **`denoPubSub(opts?)`** → `DenoPubSub` (a `PubSub`, `name: "deno"`).
- **`denoKV(opts?)`** → `DenoKV` (a `KV`).
- **`DenoOptions`**:
  - `kv` — inject a `Deno.Kv`-compatible handle (tests / a shared handle / Node).
    Defaults to `Deno.openKv()`.
  - `prefix` — key-prefix segment for KV entries (default `"kv"`).

Pair this adapter with the core plugin for the devtools view — see
[`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
