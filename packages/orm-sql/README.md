# @youneed/orm-sql

A tiny TypeORM-style SQL ORM built on **standard TC39 decorators** — no
`reflect-metadata`, no `experimentalDecorators`/`emitDecoratorMetadata`. Entities
are plain classes; databases plug in as adapters. A zero-dependency **SQLite**
adapter (Node's built-in `node:sqlite`) ships in the box as the reference engine.

```ts
import { Table, Orm, getRepository } from "@youneed/orm-sql";

class UsersTable extends Table("users") {
  @Table.primaryGeneratedColumn() id!: number;

  @Table.field("string")
  @Table.index({ group: "user_action" })
  userId!: string;

  @Table.field("string", { unique: true }) email!: string;
  @Table.column({ type: "boolean", default: true }) isActive!: boolean;

  @Table.oneToMany(() => Photo, (p) => p.user) photos!: Photo[];
}

await Orm({
  type: "sqlite",
  database: ":memory:",
  tables: [UsersTable, Photo],
  synchronize: true,
});

const users = getRepository(UsersTable);
const ada = await users.insert({ userId: "u1", email: "ada@x.com" });
await users.findOne({ email: "ada@x.com" }); // → UsersTable instance
```

> ⚠️ **`declare` doesn't work.** Standard decorators are *not valid* on `declare`
> fields (`"Decorators are not valid here"`). Use a definite-assignment field:
> `@Table.field("string") userId!: string;` — **not** `declare userId`.

## Decorators

| decorator | meaning |
| --- | --- |
| `@Table.primaryGeneratedColumn(type?)` | auto-increment primary key |
| `@Table.primaryColumn(type?)` | primary key you set yourself (e.g. a UUID) |
| `@Table.field(type, opts?)` | column shorthand — `"string"·"text"·"int"·"number"·"float"·"boolean"·"json"·"date"` |
| `@Table.column(opts)` | full column (`type`, `nullable`, `unique`, `default`) |
| `@Table.index({ group?, unique? })` | index a column; same `group` → one composite index |
| `@Table.oneToMany(() => T, inv)` · `manyToOne` · `oneToOne` · `manyToMany` | relations (lazy target thunk avoids circular imports) |

`boolean`/`json`/`date` columns are coerced both ways (true↔1, object↔JSON text,
`Date`↔epoch). `Table("name")` sets the table name; without it, it's the
snake_cased class name.

## Repository

```ts
const repo = getRepository(UsersTable);     // default connection
repo.insert(values)            // → entity (with generated id)
repo.find(where?)              // → entity[]
repo.findOne(where)            // → entity | null
repo.update(where, patch)      // → rows changed
repo.delete(where)             // → rows deleted
repo.count(where?)             // → number
```

`where` is a partial-equality match (AND-ed). All values are bound as parameters;
identifiers are quoted by the dialect — no string interpolation.

## Adapters (per-database packages)

The core generates SQL against an `Adapter`'s `Dialect`; the adapter only runs
it. SQLite is built in; other databases are separate packages:

```ts
import { Orm } from "@youneed/orm-sql";
import { mysqlAdapter } from "@youneed/orm-adapter-mysql"; // (separate package)

await Orm({ adapter: mysqlAdapter, host: "localhost", database: "test", tables: [...], synchronize: true });
```

An adapter is `{ dialect, connect(settings): Promise<Driver> }`:
- **`Dialect`** — `quoteId`, `placeholder(i)`, `columnType(t)`, `primaryGenerated(t)`.
- **`Driver`** — `execute(sql)`, `run(sql, params)`, `all(sql, params)`, `close()` (async, so network drivers fit).

NoSQL is a sibling ORM, **`@youneed/orm-mongo`** (document model, same decorator
feel). The DB-agnostic decorator/metadata layer (`metadata.ts`) is meant to be
lifted into a shared **`@youneed/orm-core`** once orm-mongo lands.

## How metadata is collected (and why it matters)

TS/esbuild only attach `Symbol.metadata` to a class that *also* has a class
decorator — entities are fields-only, so that's empty. Each field decorator
instead registers via `context.addInitializer` into a constructor-keyed `WeakMap`
(same pattern as `@youneed/schema`/`@youneed/dom`). The rules land the first time
the class is constructed, so `Orm({ tables })` builds one throwaway instance per
entity to collect them — **keep entity constructors argument-free** (use field
initializers, not constructor params).

## Read-only tables & columns

Some tables must never be written through the app — DB **views**, **reference
data**, or a **read replica**. Mark them read-only and the repository's
`insert`/`update`/`delete` throw `ReadonlyTableError`; reads work as usual.

```ts
// A view: the ORM won't create it (synchronize: false) and won't write to it.
class ActiveUser extends Table("active_users", { readonly: true, synchronize: false }) {
  @Table.field("int") id!: number;
  @Table.field("string") email!: string;
}

// Reference data: created by synchronize, but the app can't mutate it.
class Country extends Table("countries", { readonly: true }) { /* … */ }

await getRepository(ActiveUser).find();          // ✅ reads
await getRepository(ActiveUser).insert({ … });   // ✗ throws ReadonlyTableError
```

| `Table(name, opts)` | effect |
| --- | --- |
| `readonly: true` | block `insert`/`update`/`delete` (reads still work) |
| `synchronize: false` | `synchronize()` emits no DDL for it (it's a view / externally managed) |

**Read-only columns** are loaded but never sent on insert/update — for
DB-managed values (a timestamp, a computed column). Generated primary keys are
read-only automatically.

```ts
@Table.column({ type: "date", readonly: true }) createdAt!: Date; // DB sets it; never written back
```

## Migrations

`synchronize` is additive only (`CREATE … IF NOT EXISTS`). To **evolve** a schema
in production — `ALTER`, `DROP`, backfills — use `Migrator`. Applied migrations
are recorded in a `__migrations` table so each runs exactly once, and each runs
inside a transaction.

```ts
import { Orm, Migrator, defineMigration } from "@youneed/orm-sql";

const init = defineMigration({
  name: "0001_init",                              // unique + sorts in apply order
  up: (m) => m.createTable(User),                 // reuse the ORM's own DDL for an entity
  down: (m) => m.dropTable(User),
});

const addColor = defineMigration({
  name: "0002_add_color",
  async up(m) {
    await m.addColumn("users", "color", { type: "string", nullable: true });
    await m.createIndex("users", ["color"]);
  },
  async down(m) {
    await m.dropIndex("idx_users_color");
    await m.dropColumn("users", "color");
  },
});

const conn = await Orm({ type: "sqlite", database: "app.db" }); // no synchronize — migrations own the schema
const migrator = new Migrator(conn, [init, addColor]);

await migrator.up();          // apply all pending, in order → ["0001_init", "0002_add_color"]
await migrator.status();      // [{ name, applied, appliedAt }] for every migration
await migrator.down();        // roll back the last applied one (calls its down())
```

Each migration's `up`/`down` receives a `MigrationContext`: a portable schema DSL
(`createTable(Entity)`, `createTableRaw`, `dropTable`, `addColumn`, `dropColumn`,
`renameColumn`, `renameTable`, `createIndex`, `dropIndex`) plus raw `execute` /
`run` / `all` and the `connection`. `loadMigrations(dir)` imports a directory of
migration files (sorted by filename) for a file-per-migration layout.

`Connection.transaction(fn)` runs `fn` in `BEGIN`/`COMMIT`, rolling back on throw.
**Caveat:** MySQL implicitly commits on DDL, so a failed *schema* migration can't
roll back there (SQLite and Postgres wrap DDL transactionally).

## Status & edge cases (MVP)

Working today: entity metadata, `Orm()` bootstrap + default connection,
`synchronize` (`CREATE TABLE/INDEX IF NOT EXISTS`), CRUD with type coercion,
unique constraints, many-to-one foreign-key columns, the SQLite/MySQL/Postgres
adapters, **migrations** (`Migrator` — up/down/status, `ALTER`/`DROP` via the
schema DSL) and **transactions** (`Connection.transaction`).

Not yet (deliberately): a query builder (joins/ordering/pagination beyond equality
`where`), **eager/lazy relation loading** (relations are recorded + the FK column
is created, but `find` doesn't auto-join yet), automatic schema-diff migration
generation (migrations are hand-authored), and multiple named connections. These
are additive on the current core.

Integrations:
- **`@youneed/schema`** — decorate the same fields with `@IsEmail()` etc. to
  validate input before persisting; the two metadata systems are independent and
  compose. A future bridge could derive validators from column types.
- **`@youneed/server`** — call `Orm(...)` at startup; use `getRepository(...)` in
  handlers/guards. (Per-request transactions / request-scoped connections are a
  planned addition.)
