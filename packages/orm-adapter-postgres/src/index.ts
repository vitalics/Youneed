// PostgreSQL adapter for @youneed/orm-sql, backed by `pg` (node-postgres). Pass
// it to `Orm({ adapter: postgresAdapter, host, port, username, password, database })`
// — the ORM core generates SQL against this dialect and the driver runs it.
import type { Adapter, AdapterSettings, ColumnType, Dialect, Driver } from "@youneed/orm-sql";

const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';

/** PostgreSQL SQL fragments. Positional params are `$1, $2, …`; identifiers are
 *  double-quoted; the generated PK is `SERIAL`. Postgres supports
 *  `CREATE INDEX IF NOT EXISTS`, so `createIndex` is left to the core default. */
export const postgresDialect: Dialect = {
  quoteId: quote,
  placeholder: (index: number) => "$" + (index + 1),
  columnType: (type: ColumnType) => {
    switch (type) {
      case "int":
        return "INTEGER";
      case "number":
      case "float":
        return "DOUBLE PRECISION";
      case "boolean":
        return "BOOLEAN";
      case "date":
        return "BIGINT"; // the ORM core stores dates as epoch ms
      case "json":
        return "JSONB";
      case "text":
        return "TEXT";
      default:
        return "VARCHAR(255)"; // string
    }
  },
  primaryGenerated: () => "SERIAL PRIMARY KEY",
};

/** Minimal shape of the `pg` query result we rely on (avoids leaking its types). */
interface PgResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}
interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<PgResult>;
  end(): Promise<void>;
}

const INSERT_RE = /^\s*insert\b/i;

export const postgresAdapter: Adapter = {
  dialect: postgresDialect,
  async connect(settings: AdapterSettings): Promise<Driver> {
    // `pg` is CJS — its exports land on `.default` under ESM interop.
    const mod = (await import("pg")) as unknown as { Client?: new (c: unknown) => PgClient; default?: { Client: new (c: unknown) => PgClient } };
    const Client = mod.Client ?? mod.default?.Client;
    if (!Client) throw new Error("@youneed/orm-adapter-postgres: could not load `pg` Client");
    const client = new Client({
      host: settings.host ?? "localhost",
      port: settings.port ?? 5432,
      user: settings.username ?? "postgres",
      password: settings.password as string | undefined,
      database: settings.database,
      // A DSN can be passed through `connectionString` on AdapterSettings.
      connectionString: settings.connectionString as string | undefined,
    });
    await client.connect();
    return {
      async execute(sql) {
        await client.query(sql); // DDL, no result
      },
      async run(sql, params) {
        const res = await client.query(sql, params as unknown[]);
        // pg has no implicit lastInsertId. For an INSERT into a SERIAL table,
        // read the session's last sequence value (guarded: tables without a
        // sequence throw "lastval is not yet defined in this session").
        let lastInsertId: number | bigint | null = null;
        if (INSERT_RE.test(sql)) {
          try {
            const r = await client.query("SELECT lastval() AS id");
            const id = r.rows[0]?.id;
            lastInsertId = id == null ? null : Number(id);
          } catch {
            /* no sequence touched in this session — leave null */
          }
        }
        return { changes: res.rowCount ?? 0, lastInsertId };
      },
      async all<T>(sql: string, params: unknown[]) {
        const res = await client.query(sql, params);
        return res.rows as T[];
      },
      async close() {
        await client.end();
      },
    };
  },
};
