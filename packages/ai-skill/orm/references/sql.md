# @youneed/orm-sql — SQL ORM

TypeORM-style entities on TC39 decorators with built-in SQLite. Source:
`packages/orm-sql/src/{metadata,orm,adapter}.ts`. Public exports: `Table`, `Orm`,
`getConnection`, `getRepository`, `Connection`, `Repository`, `sqliteAdapter`,
`ReadonlyTableError`, `OrmSettings`.

## Defining entities

Extend `Table("table_name")` and decorate **initialized** fields (`!:`), never `declare`
fields (metadata is collected via `addInitializer`+`WeakMap`):

```ts
import { Table } from "@youneed/orm-sql";

class Users extends Table("users") {
  @Table.primaryGeneratedColumn() id!: number;                 // AUTOINCREMENT/SERIAL PK
  @Table.field("string", { unique: true }) email!: string;     // shorthand column
  @Table.Column({ type: "boolean", default: true }) active!: boolean;  // full form
  @Table.field("json", { nullable: true }) profile!: unknown;
  @Table.index() email2!: string;                              // index on a column
  @Table.oneToMany(() => Photo, p => p.user) photos!: Photo[];
}
class Photo extends Table("photos") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") url!: string;
  @Table.manyToOne(() => Users, u => u.photos) user!: Users;   // creates FK column "userId"
}
```

Decorators:
- `@Table.primaryGeneratedColumn(type = "int")` — auto-increment PK.
- `@Table.primaryColumn(type = "string")` — caller-set PK (e.g. UUID).
- `@Table.field(type, opts?)` — `type` ∈ `string|text|int|number|float|boolean|json|date`.
- `@Table.Column(opts)` — `{ type?, nullable?, unique?, readonly?, default? }`.
- `@Table.index({ group?, unique? })` — same `group` on several columns → composite index.
- Relations: `@Table.oneToMany`, `@Table.manyToOne`, `@Table.oneToOne`, `@Table.manyToMany`
  (lazy `() => Target` thunks). `manyToOne`/`oneToOne` create an FK column `<prop>Id`.

Coercion is automatic: `boolean`↔`1/0`, `json`↔`JSON.stringify`, `date`↔epoch ms.
`readonly: true` columns load but are never written.

## Connecting

```ts
import { Orm, getRepository, getConnection } from "@youneed/orm-sql";

// Built-in SQLite (node:sqlite, Node ≥ 22.5)
const conn = await Orm({ type: "sqlite", database: "app.db", tables: [Users, Photo], synchronize: true });
// database: ":memory:" | file path

// External engine via adapter
import { mysqlAdapter } from "@youneed/orm-adapter-mysql";
const conn = await Orm({
  adapter: mysqlAdapter, host: "localhost", port: 3306,
  username: "root", password: "root", database: "test",
  tables: [Users], synchronize: true,
});
```

`Orm(...)` stores the first connection as the default. `getRepository(Entity)` uses it;
`getConnection()` returns it; `conn.close()` disposes the driver.

## Repository CRUD

```ts
const users = getRepository(Users);
const u = await users.insert({ email: "ada@x.com", profile: { name: "Ada" } });  // → entity incl. PK
await users.find();                          // all
await users.find({ active: true });          // AND-ed equality
await users.findOne({ email: "ada@x.com" }); // E | null
await users.update({ id: u.id }, { active: false });  // → rows changed
await users.delete({ id: u.id });            // → rows deleted
await users.count({ active: true });
```

All values are bound params (no SQL injection); identifiers are dialect-quoted. Query FK
columns by `<prop>Id`: `await getRepository(Photo).find({ userId: u.id })`.

## Schema sync — and what's NOT supported

```ts
await conn.synchronize();   // CREATE TABLE / [UNIQUE] INDEX IF NOT EXISTS — idempotent, additive
```

MVP limits — state these plainly:
- **No `ALTER TABLE`** (column changes need a fresh DB or manual SQL).
- **No migrations**, **no `DROP`**.
- **No transactions** yet.
- Relations create FK columns but there is **no eager/lazy loading** — load related rows
  manually (`photos.find({ userId })`).
- MySQL `synchronize` re-run can error on indexes (no `IF NOT EXISTS`) — use a clean DB or
  `synchronize: false`.

## Adapters

An adapter is `{ dialect, connect(settings) }`:

```ts
interface Adapter { dialect: Dialect; connect(s: AdapterSettings): Promise<Driver>; }
interface Dialect {
  quoteId(name): string; placeholder(i): string;
  columnType(t: ColumnType): string; primaryGenerated(t: ColumnType): string;
  createIndex?(table, name, cols, unique): string;
}
interface Driver {
  execute(sql): Promise<void>;
  run(sql, params): Promise<{ changes: number; lastInsertId: number | bigint | null }>;
  all<T>(sql, params): Promise<T[]>;
  close(): Promise<void>;
}
```

`sqliteAdapter` (built-in, wraps `node:sqlite`) and `@youneed/orm-adapter-mysql`
(`mysqlAdapter`, wraps `mysql2/promise`) implement this. To support another engine, ship a
package exposing an `Adapter` and pass it as `adapter:`.
