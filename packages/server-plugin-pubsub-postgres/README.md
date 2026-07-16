# @youneed/server-plugin-pubsub-postgres

Postgres transport for [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub)
(and the KV side of [`@youneed/server-plugin-store`](../server-plugin-store)):

- **`PostgresPubSub`** — the `PubSub` contract over Postgres `LISTEN`/`NOTIFY`.
- **`PostgresKV`** — the `KV` contract backed by a table (UPSERT + atomic `incr`).

Uses the official [`pg`](https://www.npmjs.com/package/pg) driver, which is an
**optional peer dependency** — install it yourself (`npm i pg`). The driver is
imported lazily; you can also inject a `pg`-compatible `Client`/`Pool`.

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { postgresPubSub } from "@youneed/server-plugin-pubsub-postgres";

// Wire the adapter into the core pubsub plugin.
const bus = createPubSub(postgresPubSub({ connectionString: process.env.DATABASE_URL }));

Application().plugin(pubsub(bus)).listen(3000, () => {});

// Cross-instance: any process LISTENing on "orders" gets this NOTIFY.
await bus.subscribe("orders", (message) => console.log(JSON.parse(message)));
await bus.publish("orders", JSON.stringify({ id: 42 }));
```

KV (sessions, rate-limit, distributed cache) over the same database:

```ts
import { postgresKV } from "@youneed/server-plugin-pubsub-postgres";

const kv = postgresKV({ connectionString: process.env.DATABASE_URL, table: "youneed_kv" });
await kv.set("hits", "1", { ttl: 60 });
await kv.incr("hits");
```

## API

- **`postgresPubSub(opts?)`** → `PostgresPubSub` (a `PubSub`, `name: "postgres"`).
  `publish` issues `pg_notify`; `subscribe` runs `LISTEN`/`UNLISTEN` on a dedicated
  client. Note Postgres truncates identifiers longer than 63 bytes.
- **`postgresKV(opts?)`** → `PostgresKV` (a `KV`). Creates the table on first use.
  - `table` — table name (default `"youneed_kv"`).
- **`PostgresOptions`** — `{ connectionString?, client? }`. Provide a
  `connectionString` (`postgres://…`) **or** inject a `pg`-compatible `client`
  (shared pool / tests). `PostgresKVOptions` adds `table`.

Pair this adapter with the core plugin for the devtools view — see
[`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
