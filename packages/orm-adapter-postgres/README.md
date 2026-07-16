# @youneed/orm-adapter-postgres

PostgreSQL adapter for [`@youneed/orm-sql`](../orm-sql), backed by
[`pg`](https://github.com/brianc/node-postgres) (node-postgres). Same entities,
same repository API — just point `Orm()` at Postgres.

```ts
import { Orm, getRepository } from "@youneed/orm-sql";
import { postgresAdapter } from "@youneed/orm-adapter-postgres";

await Orm({
  adapter: postgresAdapter,
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "test",
  tables: [UsersTable],
  synchronize: true,
});

const users = getRepository(UsersTable);
await users.insert({ userId: "u1", email: "ada@x.com" }); // generated id populated
```

A DSN also works: `Orm({ adapter: postgresAdapter, connectionString: "postgres://user:pass@host:5432/db" })`.

## What it provides

It implements the `Adapter` contract from `@youneed/orm-sql`:

- **Dialect** — double-quote identifier quoting, positional `$1, $2, …`
  placeholders, Postgres column types (`VARCHAR(255)` · `TEXT` · `INTEGER` ·
  `DOUBLE PRECISION` · `BOOLEAN` · `JSONB` · `BIGINT` for dates, stored as epoch
  ms), `SERIAL PRIMARY KEY`, and the core's standard
  `CREATE INDEX IF NOT EXISTS` (Postgres supports it, so no override).
- **Driver** — a `pg` `Client`: `query` for DDL and parameterized reads/writes.
  Postgres has no implicit `lastInsertId`, so after an `INSERT` the driver reads
  `SELECT lastval()` (guarded) to populate a generated `SERIAL` primary key.

## A Postgres to test against

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=test -p 5432:5432 postgres:16
```

The bundled test (`pnpm --filter @youneed/orm-adapter-postgres test`) covers the
pure dialect only — no server needed. To exercise the driver end-to-end, point
the ORM at the container above.

> Prefer [migrations](../orm-sql#migrations) (`Migrator`) over `synchronize` for
> production schema changes — Postgres wraps DDL transactionally, so a failed
> migration rolls back cleanly.
