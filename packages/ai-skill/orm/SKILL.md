---
name: youneed-orm
description: "Data persistence in the youneed framework: the SQL ORM @youneed/orm-sql (TypeORM-style entities on TC39 decorators, built-in SQLite via node:sqlite, pluggable dialect adapters like @youneed/orm-adapter-mysql, repository CRUD), the document/NoSQL ORM @youneed/orm-nosql (Mongo-style Collection entities, built-in in-memory store + @youneed/orm-adapter-mongo, Mongo-operator filters, repository CRUD), and the key-value layer @youneed/kv (KV contract + in-process MemoryKV + namespaced) with @youneed/kv-redis (Redis/Valkey over RESP). This skill should be used when defining SQL or document entities, connecting to SQLite/MySQL/MongoDB or the in-memory stores, doing repository CRUD, or using KV stores for sessions/rate-limit/distributed cache."
license: ISC
---

# youneed — ORM (SQL + Document) & KV Stores

Three persistence layers — pick by data shape. Source of truth:
`packages/orm-sql/src/{metadata,orm,adapter}.ts`, `packages/orm-nosql/src/{metadata,nosql,adapter,provider}.ts`,
`packages/orm-adapter-mongo/src/index.ts`, `packages/kv/src/index.ts`,
`packages/kv-redis/src/index.ts`, and `examples/{crud,orm-mysql,orm-mongo,server-devtools}`.
Verify a signature in source before asserting it.

| Task | Read |
|------|------|
| SQL: `Table` entities, connection/DataSource, repository CRUD, relations, adapters, limits | `references/sql.md` |
| Document/NoSQL: `Collection` entities, `Nosql()`, Mongo-style CRUD, in-memory + `mongoAdapter` | `references/nosql.md` |
| Key-value: `KV` contract, `MemoryKV`, `namespaced`, `redisKV`, sessions/rate-limit/cache | `references/kv.md` |

**Pick the layer:** relational rows + schema → **orm-sql**; schema-light JSON
documents + Mongo-operator queries → **orm-nosql**; ephemeral string/JSON values
with TTL (sessions, counters, cache) → **kv**. orm-nosql and kv are NOT the same
thing (document ORM vs key-value store).

## At a glance — SQL (@youneed/orm-sql)

```ts
import { Table, Orm, getRepository } from "@youneed/orm-sql";

class Users extends Table("users") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string", { unique: true }) email!: string;
  @Table.Column({ type: "boolean", default: true }) active!: boolean;
}

const conn = await Orm({ type: "sqlite", database: "app.db", tables: [Users], synchronize: true });
const users = getRepository(Users);
const u = await users.insert({ email: "ada@x.com" });
await users.find({ active: true });
```

- Entities extend `Table("name")`; decorators go on **initialized** fields, never `declare`
  (metadata is collected via `addInitializer`+`WeakMap`, like the rest of youneed).
- Built-in SQLite uses `node:sqlite` (Node ≥ 22.5). Other engines = a separate adapter
  package (e.g. `@youneed/orm-adapter-mysql`).
- `synchronize` is additive only (CREATE TABLE/INDEX IF NOT EXISTS) — **no ALTER, no
  migrations, no transactions yet**. Repository `where` clauses are AND-ed equality on
  bound params. Relations create FK columns (`<prop>Id`) but there is **no eager/lazy
  loading** — join manually.

## At a glance — Document NoSQL (@youneed/orm-nosql)

```ts
import { Collection, Nosql, getCollectionRepository } from "@youneed/orm-nosql";

class User extends Collection("users") {
  @Collection.id() id!: string;                              // store-assigned → `_id` in Mongo
  @Collection.field("string", { unique: true }) email!: string;
  @Collection.field("number", { optional: true }) age?: number;
}

// in-memory (tests/dev) — or { adapter: mongoAdapter, url, database } from @youneed/orm-adapter-mongo
const db = await Nosql({ type: "memory", collections: [User], synchronize: true });
const users = getCollectionRepository(User);
await users.insertOne({ email: "ada@x.com", age: 36 });
await users.find({ age: { $gte: 30 } }, { sort: { age: 1 }, limit: 20 });   // Mongo-style filters
```

- `Collection("name")` entities (decorators on initialized fields). Filters are
  **native Mongo operators** (`$gt`/`$in`/`$regex`/…), not orm-sql equality `where`.
- Built-in `type: "memory"` store, or `mongoAdapter` from `@youneed/orm-adapter-mongo`.
  The `Connection` is a `ServerPlugin` (`app.plugin(db)`); `devtools: true` mounts a
  Mongo-Compass-style studio. `nosqlProvider(db, {...})` adds `this.db.<name>` to a Controller.
- **MVP limits:** no aggregation, transactions, relations/populate, or migrations. See `references/nosql.md`.

## At a glance — KV (@youneed/kv + @youneed/kv-redis)

```ts
import { MemoryKV, namespaced } from "@youneed/kv";
import { redisKV } from "@youneed/kv-redis";

const kv = process.env.REDIS_URL ? redisKV({ url: process.env.REDIS_URL }) : new MemoryKV();
await kv.set("k", "v", { ttl: 60 });            // values are strings — caller serializes
const hits = await kv.incr("rl:ip", { by: 1, ttl: 60 });   // atomic counter
const sessions = namespaced(kv, "sess");        // prefix-isolated view of one backend
```

The `KV` contract backs distributed features elsewhere: `createDistributedCache({ store })`,
`KvSessionStore` (session middleware), `KvFixedWindow` (rate-limit middleware).

## Answering style

- First route by data shape: relational → orm-sql (`Table`), documents → orm-nosql
  (`Collection`), key-value/TTL → kv. Don't reach for kv when the user means documents.
- Show the decorator-on-initialized-field entity shape and the exact import path.
- State the MVP limits plainly — orm-sql: no ALTER/migrations/transactions + manual
  relation loading; orm-nosql: no aggregation/transactions/populate/migrations — so
  callers don't assume full TypeORM / Mongoose behavior.
- For multi-process state, recommend the real backend (`mongoAdapter`, `redisKV`) +
  the right adapter; for single-process or tests, the in-memory store (`MemoryKV`,
  `Nosql({ type: "memory" })`).
