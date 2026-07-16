# youneed — Document NoSQL ORM (@youneed/orm-nosql)

A document store ORM (Mongo-shaped) on the same factory-class + TC39-decorator
pattern as `@youneed/orm-sql`'s `Table`. Built-in zero-dependency in-memory driver;
MongoDB via the `@youneed/orm-adapter-mongo` adapter. **Distinct from `@youneed/kv`**
(that's a key-value store — strings + TTL, no schema; see `references/kv.md`).
Source of truth: `packages/orm-nosql/src/{metadata,nosql,adapter,provider,devtools}.ts`,
`packages/orm-adapter-mongo/src/index.ts`, `examples/orm-mongo`, `examples/server-devtools`.
Verify a signature in source before asserting it.

## Define a collection

```ts
import { Collection, Nosql, getCollectionRepository } from "@youneed/orm-nosql";

class User extends Collection("users") {
  @Collection.id() id!: string;                              // store-assigned key → `_id` in Mongo
  @Collection.field("string", { unique: true }) email!: string;
  @Collection.field("string") name!: string;
  @Collection.field("number", { optional: true }) age?: number;
  @Collection.index({ group: "by_date" }) createdAt!: Date;  // composite index via shared `group`
}
```

- Entities extend `Collection("name")` (name defaults to kebab-case-plural of the
  class). Decorators on **initialized** fields (`!: T`), never `declare` — metadata
  via `addInitializer`+`WeakMap`, same rule as the rest of youneed.
- `@Collection.id(opts?)` primary key (default store-generated; `{ generated: false }`
  for user-supplied). `@Collection.field(type, opts?)` shorthand — type is
  `"string"|"number"|"boolean"|"date"|"object"|"array"|"id"`, opts
  `{ optional, unique, readonly, default }`. `@Collection.prop({...})` full form.
- `@Collection.index({ group?, unique? })` indexes a field. `@Collection.ref(() => Other)`
  stores another doc's id (lazy thunk) — **opaque id only, no populate/auto-fetch**.
- `"date"` fields auto-coerce string↔Date on round-trip; readonly/generated fields
  are never written on insert/update.

## Connect (`Nosql(settings)`) → `Connection`

```ts
// in-memory (single-process; tests / dev):
const db = await Nosql({ type: "memory", collections: [User], synchronize: true });

// MongoDB via adapter:
import { mongoAdapter } from "@youneed/orm-adapter-mongo";
const db = await Nosql({
  adapter: mongoAdapter,
  url: "mongodb://localhost:27017",     // or discrete host/port/username/password
  database: "app_db",
  collections: [User],
  synchronize: true,                    // register collections + unique indexes
  devtools: true,                       // dev-only data browser at /__nosql
});
```

- `type: "memory"` (built-in `memoryAdapter`, `Map`-backed, not cluster-safe) or an
  `adapter:` (overrides `type`). `synchronize` is **idempotent** (create collections +
  indexes) — no migrations/versioning.
- `getConnection()` returns the last `Nosql()` connection; `getCollectionRepository(Entity, conn?)`
  gets a typed repo. `db.close()` to disconnect.
- The `Connection` IS a `ServerPlugin` (`name: "orm-nosql"`): `app.plugin(db)` mounts
  the devtools data-browser routes + surfaces schema/op-stats in Topology via `inspect()`.

## Repository CRUD (Mongo-style filters)

```ts
const repo = getCollectionRepository(User);
const ada = await repo.insertOne({ name: "Ada", email: "ada@x.dev" });   // → entity w/ id
await repo.insertMany([{ name: "Linus", email: "l@x.dev" }]);
const grown = await repo.find({ age: { $gte: 30 } }, { sort: { age: 1 }, limit: 20, skip: 0 });
const one = await repo.findOne({ email: "ada@x.dev" });
const byId = await repo.findById(ada.id);
const updated = await repo.updateOne({ id: ada.id }, { age: 36 });        // → count
const upd2 = await repo.updateMany({ age: { $lt: 18 } }, { minor: true });
const del = await repo.deleteMany({ email: { $regex: "@test\\." } });     // → count
const n = await repo.count({ name: "Ada" });
```

- Methods: `insertOne` / `insertMany` / `find(filter?, {sort,skip,limit})` / `findOne` /
  `findById` / `updateOne` / `updateMany` / `deleteOne` / `deleteMany` / `count`.
- Filters are **native Mongo operators** (not orm-sql `Where` equality): `$eq`, `$ne`,
  `$gt(e)`, `$lt(e)`, `$in`, `$nin`, `$exists`, `$regex` — bare value = equality.
  `sort: { field: 1 | -1 }`. The memory driver evaluates these in JS; the Mongo
  adapter passes them through (and translates the id field ↔ `_id`, coercing 24-hex
  strings to `ObjectId`).

## Controller provider + devtools

```ts
import { nosqlProvider } from "@youneed/orm-nosql";

class Users extends Controller("/users", {
  providers: [nosqlProvider(db, { repositories: { users: getCollectionRepository(User) } })],
}) {
  @Controller.get() list() { return this.db.users.find(); }   // this.db.<name>, typed
}
```

- `nosqlProvider(connection, { repositories })` adds a private `this.db` namespace of
  typed repos to a controller — the document analog of orm-sql's `ormProvider`.
- Devtools: `devtools: true` on `Nosql(...)` mounts a Mongo-Compass-style studio
  (`/__nosql`: collection browser, paged doc grid, JSON find console, insert/update/
  delete unless `readonly`). The interactive panel is `@youneed/orm-nosql/devtools`
  (`NosqlPanel`, registered into `@youneed/server-plugin-devtools/registry`); without
  it the "NoSQL" tab degrades to a read-only schema + op-stats inspector.

## MVP limits (vs orm-sql)

- **No aggregation** (`$group`/`$lookup`), **no transactions**, **no relations/populate**
  (refs are opaque ids — fetch separately), **no migrations** (`synchronize` is additive).
- Memory driver is single-process; the Mongo adapter is a single connection (no replica-set
  management in core). Filters are Mongo-style (orm-sql is TypeORM `Where` equality);
  schema is flat JSON, not SQL columns.

## Answering style

- Show `Collection(...)`-on-initialized-fields + the exact import. Use Mongo-style
  filter operators in queries (not orm-sql equality `where`).
- Pick the driver: `type: "memory"` for tests/single-process, `mongoAdapter` for prod.
- Keep it distinct from `@youneed/kv` — document ORM with schema/queries, not a KV store.
