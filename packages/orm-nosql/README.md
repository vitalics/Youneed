# @youneed/orm-nosql

A tiny document/NoSQL ORM built on **standard TC39 decorators** — no
`reflect-metadata`, no `experimentalDecorators`/`emitDecoratorMetadata`.
Mongoose-style collections, Mongo-style query filters, and pluggable
document-store adapters. A zero-dependency **in-memory** store ships in the box as
the reference engine. It's the NoSQL sibling of [`@youneed/orm-sql`](../orm-sql).

```ts
import { Collection, Nosql, getCollectionRepository } from "@youneed/orm-nosql";

class Users extends Collection("users") {
  @Collection.id() id!: string;                          // store-assigned key
  @Collection.field("string", { unique: true }) email!: string;
  @Collection.field("string") name!: string;
  @Collection.field("boolean", { default: true }) active!: boolean;
  @Collection.index({ group: "by_name" }) sortName!: string;
}

await Nosql({ type: "memory", collections: [Users], synchronize: true });

const users = getCollectionRepository(Users);
const ada = await users.insertOne({ email: "ada@x.com", name: "Ada" }); // → Users instance w/ id
await users.findOne({ email: "ada@x.com" });            // Mongo-style filter
await users.find({ active: true }, { limit: 20, sort: { name: 1 } });
```

> ⚠️ **`declare` doesn't work.** Standard decorators are *not valid* on `declare`
> fields. Use a definite-assignment field: `@Collection.field("string") name!: string;`
> — **not** `declare name`.

## Decorators

| decorator | meaning |
| --- | --- |
| `@Collection.id(opts?)` | the document key. `generated` (default) ⇒ store assigns it; `{ generated: false }` for an app-supplied key |
| `@Collection.field(type, opts?)` | field shorthand — `"string"·"number"·"boolean"·"date"·"object"·"array"·"id"` |
| `@Collection.prop(opts)` | full field form (`type`, `optional`, `unique`, `readonly`, `default`) |
| `@Collection.index({ group?, unique? })` | index a field; same `group` → one composite index |
| `@Collection.ref(() => T)` | a reference to another collection's document, stored by its id (lazy target thunk avoids circular imports) |

`Collection("name", opts?)` is the base every document extends; the name is
optional and defaults to a kebab-case plural of the class name. `opts.readonly`
blocks writes through the ORM (views, reference data, read replicas) — `insert`/
`update`/`delete` then throw `ReadonlyCollectionError`.

## Repository

```ts
const repo = getCollectionRepository(Users);   // default connection
repo.insertOne(doc)        // → entity (with generated id)
repo.insertMany(docs)      // → entity[]
repo.find(filter?, opts?)  // → entity[]  (opts: sort/skip/limit)
repo.findOne(filter?)      // → entity | null
repo.findById(id)          // → entity | null
repo.updateOne(filter, patch) · repo.updateMany(filter, patch)  // → modified count
repo.deleteOne(filter)     · repo.deleteMany(filter)            // → deleted count
repo.count(filter?)        // → number
```

Filters are Mongo-style (`matchFilter`/`sortDocs` power the in-memory driver).
`date` fields are coerced both ways; `readonly` and generated-primary fields are
never written.

## Bootstrap & connection

```ts
const conn = await Nosql({ type: "memory", collections: [Users], synchronize: true });
getConnection();                       // the default connection (last Nosql() call)
getCollectionRepository(Users, conn);  // repository against a specific connection
conn.getRepository(Users);             // same, on the Connection instance
```

`Nosql(settings)` returns a `Connection` that is **also a `ServerPlugin`** — pass
it to `Application(...).plugin(conn)`. `synchronize: true` registers each
collection + its unique indexes on connect.

## Adapters (per-database packages)

`"memory"` is built in (`memoryAdapter`). Other stores are separate packages —
pass one as `{ adapter }`:

```ts
import { Nosql } from "@youneed/orm-nosql";
import { mongoAdapter } from "@youneed/orm-adapter-mongo"; // (separate package)

await Nosql({ adapter: mongoAdapter, database: "app", collections: [Users], synchronize: true });
```

A `DocumentAdapter` is `{ name, connect(settings): Promise<DocumentDriver> }`; the
`DocumentDriver` runs the document ops (`find`/`insert`/`update`/`delete`/`count`/
`ensureCollection`/`createIndex`/`close`). The in-memory implementation
(`MemoryDriver`) and the matcher/sorter (`matchFilter`, `sortDocs`) are exported
for tests and custom adapters.

## Controller provider — `this.db`

`nosqlProvider(connection, { repositories })` is a
[`@youneed/server`](../server) controller provider: it adds a private, typed
`this.db` namespace holding the repositories you name, so handlers read
`this.db.users.find()` with autocomplete instead of the module-global
`getCollectionRepository(...)`.

```ts
import { Application, Controller } from "@youneed/server";
import { Nosql, getCollectionRepository, nosqlProvider } from "@youneed/orm-nosql";

const db = await Nosql({ type: "memory", collections: [Users], synchronize: true });

class UsersController extends Controller("/users", {
  providers: [nosqlProvider(db, { repositories: { users: getCollectionRepository(Users) } })],
}) {
  @Controller.get()
  list() {
    return this.db.users.find(); // `users` autocompletes
  }
}

Application(UsersController).plugin(db).listen(3000, () => {});
```

## Devtools

When the connection is mounted as a plugin with `devtools: true` (or an options
object), it exposes a dev-only Mongo-Compass-style data browser — paginated
document browse, a JSON find console, and insert/update/delete — surfaced as the
"NoSQL" tab in [`@youneed/server-plugin-devtools`](../server-plugin-devtools).
**Dev only**; never enable in production (or guard the mount path).

```ts
await Nosql({ type: "memory", collections: [Users], synchronize: true, devtools: true });
// or: devtools: { path: "/__nosql", readonly: false, maxDocs: 200 }
```

The renderer is registered via the `@youneed/orm-nosql/devtools` subpath import.

## How metadata is collected (and why it matters)

TS/esbuild only attach `Symbol.metadata` to a class that *also* has a class
decorator — collections are fields-only, so that's empty. Each field decorator
instead registers via `context.addInitializer` into a constructor-keyed `WeakMap`
(same pattern as [`@youneed/orm-sql`](../orm-sql) / `@youneed/schema` /
`@youneed/dom`). The rules land the first time the class is constructed, so
`Nosql({ collections })` builds one throwaway instance per collection to collect
them — **keep collection constructors argument-free** (use field initializers,
not constructor params).
