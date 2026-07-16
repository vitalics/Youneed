// MySQL adapter for @youneed/orm-sql, backed by `mysql2/promise`. Pass it to
// `Orm({ adapter: mysqlAdapter, host, port, username, password, database })` —
// the ORM core generates SQL against this dialect and the driver runs it.
import type { Adapter, AdapterSettings, ColumnType, Dialect, Driver } from "@youneed/orm-sql";

const quote = (name: string) => "`" + name.replace(/`/g, "``") + "`";

/** MySQL SQL fragments. Note: MySQL has no `IF NOT EXISTS` on `CREATE INDEX`,
 *  so `createIndex` overrides the core default. */
export const mysqlDialect: Dialect = {
  quoteId: quote,
  placeholder: () => "?",
  columnType: (type: ColumnType) => {
    switch (type) {
      case "int":
        return "INT";
      case "number":
      case "float":
        return "DOUBLE";
      case "boolean":
        return "TINYINT(1)";
      case "date":
        return "BIGINT"; // the ORM core stores dates as epoch ms
      case "json":
        return "JSON";
      case "text":
        return "TEXT";
      default:
        return "VARCHAR(255)"; // string
    }
  },
  primaryGenerated: () => "INT AUTO_INCREMENT PRIMARY KEY",
  createIndex: (table, name, columns, unique) =>
    `CREATE ${unique ? "UNIQUE " : ""}INDEX ${quote(name)} ON ${quote(table)} (${columns.map(quote).join(", ")})`,
};

/** Minimal shape of the mysql2 result we rely on (avoids leaking its full types). */
interface MysqlWriteResult {
  affectedRows?: number;
  insertId?: number;
}

export const mysqlAdapter: Adapter = {
  dialect: mysqlDialect,
  async connect(settings: AdapterSettings): Promise<Driver> {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection({
      host: settings.host ?? "localhost",
      port: settings.port ?? 3306,
      user: settings.username ?? "root",
      password: settings.password as string | undefined,
      database: settings.database,
    });
    return {
      async execute(sql) {
        await conn.query(sql); // DDL: plain query, no prepared statement
      },
      async run(sql, params) {
        const [res] = await conn.execute(sql, params as never[]);
        const r = res as MysqlWriteResult;
        return { changes: r.affectedRows ?? 0, lastInsertId: r.insertId ?? null };
      },
      async all<T>(sql: string, params: unknown[]) {
        const [rows] = await conn.execute(sql, params as never[]);
        return rows as T[];
      },
      async close() {
        await conn.end();
      },
    };
  },
};
