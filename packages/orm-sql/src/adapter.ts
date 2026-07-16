// The contract a database adapter implements. DB-specific packages
// (`@youneed/orm-adapter-mysql`, `-postgres`, …) export an `Adapter`; the SQL
// generation (DDL + CRUD) lives in the core and asks the adapter's `Dialect` for
// the dialect-specific bits (quoting, placeholders, type names). A zero-dep
// SQLite adapter ships here as the reference + test engine (uses `node:sqlite`).
import type { ColumnType } from "./metadata.ts";

/** A live, low-level connection. Async so network drivers (mysql/pg) fit too. */
export interface Driver {
  /** Run statement(s) with no result (DDL). */
  execute(sql: string): Promise<void>;
  /** Run a parameterized write; report row count + last insert id. */
  run(sql: string, params: unknown[]): Promise<{ changes: number; lastInsertId: number | bigint | null }>;
  /** Run a parameterized read; return rows as plain objects. */
  all<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/** Dialect-specific SQL fragments. */
export interface Dialect {
  /** Quote an identifier (table/column). */
  quoteId(name: string): string;
  /** Positional placeholder for the i-th (0-based) parameter. */
  placeholder(index: number): string;
  /** SQL type for a logical column type. */
  columnType(type: ColumnType): string;
  /** Full column definition for an auto-generated primary key. */
  primaryGenerated(type: ColumnType): string;
  /**
   * `CREATE INDEX` statement. Optional — the core falls back to the standard
   * `CREATE [UNIQUE] INDEX IF NOT EXISTS …` form. Override it where that syntax
   * differs (MySQL, for instance, has no `IF NOT EXISTS` on indexes).
   */
  createIndex?(table: string, name: string, columns: string[], unique: boolean): string;
}

export interface AdapterSettings {
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  [k: string]: unknown;
}

/** What a DB package exports. */
export interface Adapter {
  dialect: Dialect;
  connect(settings: AdapterSettings): Promise<Driver>;
}

// ── Built-in SQLite adapter (node:sqlite) ───────────────────────────────────────

const sqliteDialect: Dialect = {
  quoteId: (name) => `"${name.replace(/"/g, '""')}"`,
  placeholder: () => "?",
  columnType: (type) => {
    switch (type) {
      case "int":
      case "boolean":
      case "date":
        return "INTEGER";
      case "float":
      case "number":
        return "REAL";
      default:
        return "TEXT"; // string | text | json
    }
  },
  primaryGenerated: () => "INTEGER PRIMARY KEY AUTOINCREMENT",
};

/**
 * Reference adapter backed by Node's built-in `node:sqlite` (Node ≥ 22.5,
 * stable in 24). `database` is a file path or `":memory:"`.
 */
export const sqliteAdapter: Adapter = {
  dialect: sqliteDialect,
  async connect(settings) {
    // Imported lazily so the package loads even where node:sqlite is absent.
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(settings.database ?? ":memory:");
    return {
      async execute(sql) {
        db.exec(sql);
      },
      async run(sql, params) {
        const r = db.prepare(sql).run(...(params as never[]));
        return { changes: Number(r.changes), lastInsertId: r.lastInsertRowid ?? null };
      },
      async all<T>(sql: string, params: unknown[]) {
        return db.prepare(sql).all(...(params as never[])) as T[];
      },
      async close() {
        db.close();
      },
    };
  },
};
