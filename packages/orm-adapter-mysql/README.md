# @youneed/orm-adapter-mysql

MySQL adapter for [`@youneed/orm-sql`](../orm-sql), backed by
[`mysql2`](https://github.com/sidorares/node-mysql2). Same entities, same
repository API — just point `Orm()` at MySQL.

```ts
import { Orm, getRepository } from "@youneed/orm-sql";
import { mysqlAdapter } from "@youneed/orm-adapter-mysql";

await Orm({
  adapter: mysqlAdapter,
  host: "localhost",
  port: 3306,
  username: "root",
  password: "root",
  database: "test",
  tables: [UsersTable],
  synchronize: true,
});

const users = getRepository(UsersTable);
await users.insert({ userId: "u1", email: "ada@x.com" });
```

## What it provides

It implements the `Adapter` contract from `@youneed/orm-sql`:

- **Dialect** — backtick identifier quoting, `?` placeholders, MySQL column types
  (`VARCHAR(255)` · `TEXT` · `INT` · `DOUBLE` · `TINYINT(1)` · `JSON` · `BIGINT`
  for dates, stored as epoch ms), `INT AUTO_INCREMENT PRIMARY KEY`, and a
  `CREATE INDEX` form **without** `IF NOT EXISTS` (MySQL has no such clause).
- **Driver** — `mysql2/promise` connection: `query` for DDL, prepared `execute`
  for parameterized reads/writes (`insertId` → generated primary key).

## A MySQL to test against

```bash
docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=test -p 3306:3306 mysql:8
```

> Idempotency note: `synchronize` issues `CREATE TABLE IF NOT EXISTS`, but MySQL
> indexes have no `IF NOT EXISTS` — re-running synchronize on an existing schema
> will error on the index. Run it against a fresh database, or skip `synchronize`
> and manage schema with migrations (planned in `@youneed/orm-sql`).
