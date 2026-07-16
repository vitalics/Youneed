// @youneed/orm-sql — schema migrations.
//
// `synchronize` only ever runs `CREATE TABLE/INDEX IF NOT EXISTS` (additive, no
// destructive change). Migrations are the ordered, reversible way to EVOLVE a
// schema in production: `ALTER`, `DROP`, data backfills — each recorded so it
// runs exactly once. Applied migrations are tracked in a `__migrations` table;
// each migration runs inside a transaction (see `Connection.transaction` for the
// MySQL-DDL caveat).
//
//   const migrator = new Migrator(conn, [init, addEmailIndex]);
//   await migrator.up();                 // apply all pending, in order
//   await migrator.down();               // roll back the last one
//   await migrator.status();             // [{ name, applied, appliedAt }]
//
// A migration reuses the ORM's own DDL generator via `m.schema.createTable(Entity)`,
// or issues portable DDL through the schema builder (`addColumn`, `dropColumn`,
// `renameColumn`, `createIndex`, …), or drops to raw SQL with `m.execute(sql)`.

import type { ColumnType } from "./metadata.ts";
import type { Connection } from "./orm.ts";

/** A column definition for `createTableRaw` / `addColumn`. */
export interface ColumnDef {
  type: ColumnType;
  nullable?: boolean;
  unique?: boolean;
  primary?: boolean;
  /** Auto-generated primary key (`SERIAL`/`AUTOINCREMENT`/…). Implies `primary`. */
  generated?: boolean;
  default?: unknown;
}

/** Portable schema-change DSL handed to a migration. Every method emits DDL for
 *  the connection's dialect and runs it. */
export interface SchemaBuilder {
  /** Reuse the ORM's `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX` for an entity. */
  createTable(Entity: new () => object): Promise<void>;
  /** Create a table from an explicit column map. */
  createTableRaw(table: string, columns: Record<string, ColumnDef>): Promise<void>;
  /** `DROP TABLE IF EXISTS`. */
  dropTable(table: string | (new () => object)): Promise<void>;
  /** `ALTER TABLE … RENAME TO …`. */
  renameTable(from: string, to: string): Promise<void>;
  /** `ALTER TABLE … ADD COLUMN …`. */
  addColumn(table: string, name: string, def: ColumnDef): Promise<void>;
  /** `ALTER TABLE … DROP COLUMN …` (SQLite needs ≥ 3.35). */
  dropColumn(table: string, name: string): Promise<void>;
  /** `ALTER TABLE … RENAME COLUMN … TO …`. */
  renameColumn(table: string, from: string, to: string): Promise<void>;
  /** `CREATE [UNIQUE] INDEX …`. Name defaults to `idx_<table>_<cols>`. */
  createIndex(table: string, columns: string[], opts?: { unique?: boolean; name?: string }): Promise<void>;
  /** `DROP INDEX …`. Pass `table` for MySQL (`DROP INDEX <name> ON <table>`). */
  dropIndex(name: string, table?: string): Promise<void>;
}

/** The context a migration's `up`/`down` receives. */
export interface MigrationContext extends SchemaBuilder {
  /** Raw DDL / no-result statement. */
  execute(sql: string): Promise<void>;
  /** Raw parameterized write. */
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertId: number | bigint | null }>;
  /** Raw parameterized read. */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** The underlying connection (escape hatch: repositories, dialect, …). */
  readonly connection: Connection;
  /** Portable schema-change DSL (also spread onto the context directly). */
  readonly schema: SchemaBuilder;
}

/** One migration. `name` must be unique and sort in apply order (e.g. `0001_init`). */
export interface Migration {
  name: string;
  up(m: MigrationContext): Promise<void> | void;
  down?(m: MigrationContext): Promise<void> | void;
}

/** Identity helper — for editor types + a stable authoring shape. */
export function defineMigration(m: Migration): Migration {
  return m;
}

/** The applied/pending state of one migration. */
export interface MigrationStatus {
  name: string;
  applied: boolean;
  appliedAt?: number;
}

export interface MigratorOptions {
  /** Bookkeeping table name. Default `__migrations`. */
  table?: string;
}

/** Format a JS value as a SQL literal for a column `DEFAULT`. */
function sqlDefault(value: unknown, type: ColumnType): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Date) return String(value.getTime());
  if (type === "json") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Build a `SchemaBuilder` bound to a connection's dialect + driver. */
function schemaBuilder(conn: Connection): SchemaBuilder {
  const q = (s: string) => conn.dialect.quoteId(s);
  const tableName = (t: string | (new () => object)) => (typeof t === "string" ? t : conn.createTableSql(t).match(/EXISTS\s+(\S+)/)?.[1]?.replace(/["`]/g, "") ?? "");

  const columnDdl = (name: string, def: ColumnDef): string => {
    if (def.generated) return `${q(name)} ${conn.dialect.primaryGenerated(def.type)}`;
    let ddl = `${q(name)} ${conn.dialect.columnType(def.type)}`;
    if (def.primary) ddl += " PRIMARY KEY";
    if (!def.nullable && !def.primary) ddl += " NOT NULL";
    if (def.unique && !def.primary) ddl += " UNIQUE";
    if (def.default !== undefined) ddl += ` DEFAULT ${sqlDefault(def.default, def.type)}`;
    return ddl;
  };

  return {
    async createTable(Entity) {
      await conn.execute(conn.createTableSql(Entity));
      for (const sql of conn.createIndexSql(Entity)) await conn.execute(sql);
    },
    async createTableRaw(table, columns) {
      const defs = Object.entries(columns).map(([name, def]) => columnDdl(name, def));
      await conn.execute(`CREATE TABLE IF NOT EXISTS ${q(table)} (${defs.join(", ")})`);
    },
    async dropTable(table) {
      await conn.execute(`DROP TABLE IF EXISTS ${q(tableName(table))}`);
    },
    async renameTable(from, to) {
      await conn.execute(`ALTER TABLE ${q(from)} RENAME TO ${q(to)}`);
    },
    async addColumn(table, name, def) {
      await conn.execute(`ALTER TABLE ${q(table)} ADD COLUMN ${columnDdl(name, def)}`);
    },
    async dropColumn(table, name) {
      await conn.execute(`ALTER TABLE ${q(table)} DROP COLUMN ${q(name)}`);
    },
    async renameColumn(table, from, to) {
      await conn.execute(`ALTER TABLE ${q(table)} RENAME COLUMN ${q(from)} TO ${q(to)}`);
    },
    async createIndex(table, columns, opts = {}) {
      const name = opts.name ?? `idx_${table}_${columns.join("_")}`;
      const sql = conn.dialect.createIndex
        ? conn.dialect.createIndex(table, name, columns, !!opts.unique)
        : `CREATE ${opts.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${q(name)} ON ${q(table)} (${columns.map(q).join(", ")})`;
      await conn.execute(sql);
    },
    async dropIndex(name, table) {
      await conn.execute(table ? `DROP INDEX ${q(name)} ON ${q(table)}` : `DROP INDEX IF EXISTS ${q(name)}`);
    },
  };
}

/**
 * Runs a fixed, ordered list of {@link Migration}s against a {@link Connection},
 * recording applied ones in a bookkeeping table so each runs once.
 */
export class Migrator {
  #conn: Connection;
  #migrations: Migration[];
  #table: string;
  #ready = false;

  constructor(connection: Connection, migrations: Migration[], opts: MigratorOptions = {}) {
    this.#conn = connection;
    this.#migrations = migrations;
    this.#table = opts.table ?? "__migrations";
    const seen = new Set<string>();
    for (const m of migrations) {
      if (seen.has(m.name)) throw new Error(`Migrator: duplicate migration name "${m.name}"`);
      seen.add(m.name);
    }
  }

  #ctx(): MigrationContext {
    const schema = schemaBuilder(this.#conn);
    const conn = this.#conn;
    return {
      ...schema,
      schema,
      connection: conn,
      execute: (sql) => conn.execute(sql),
      run: (sql, params = []) => conn.run(sql, params),
      all: <T>(sql: string, params: unknown[] = []) => conn.all<T>(sql, params),
    };
  }

  /** Create the bookkeeping table if absent (idempotent). */
  async #ensure(): Promise<void> {
    if (this.#ready) return;
    const q = (s: string) => this.#conn.dialect.quoteId(s);
    const strType = this.#conn.dialect.columnType("string");
    const intType = this.#conn.dialect.columnType("int");
    await this.#conn.execute(`CREATE TABLE IF NOT EXISTS ${q(this.#table)} (${q("name")} ${strType} PRIMARY KEY, ${q("applied_at")} ${intType} NOT NULL)`);
    this.#ready = true;
  }

  /** Names of applied migrations (in apply order). */
  async #applied(): Promise<Map<string, number>> {
    await this.#ensure();
    const q = (s: string) => this.#conn.dialect.quoteId(s);
    const rows = await this.#conn.all<{ name: string; applied_at: number }>(
      `SELECT ${q("name")}, ${q("applied_at")} FROM ${q(this.#table)} ORDER BY ${q("applied_at")} ASC, ${q("name")} ASC`,
      [],
    );
    return new Map(rows.map((r) => [r.name, Number(r.applied_at)]));
  }

  /** Migrations not yet applied, in declared order. */
  async pending(): Promise<Migration[]> {
    const applied = await this.#applied();
    return this.#migrations.filter((m) => !applied.has(m.name));
  }

  /** Per-migration applied/pending state, in declared order. */
  async status(): Promise<MigrationStatus[]> {
    const applied = await this.#applied();
    return this.#migrations.map((m) => ({ name: m.name, applied: applied.has(m.name), appliedAt: applied.get(m.name) }));
  }

  /** The most recently applied migration name, or `null`. */
  async latest(): Promise<string | null> {
    const applied = [...(await this.#applied()).keys()];
    return applied.length ? applied[applied.length - 1]! : null;
  }

  /**
   * Apply pending migrations in order. Stops after `opts.to` (inclusive) when
   * given. Each migration + its bookkeeping row commit in one transaction.
   * Returns the names applied.
   */
  async up(opts: { to?: string; now?: () => number } = {}): Promise<string[]> {
    await this.#ensure();
    const applied = await this.#applied();
    const now = opts.now ?? (() => Date.now());
    const q = (s: string) => this.#conn.dialect.quoteId(s);
    const done: string[] = [];
    for (const m of this.#migrations) {
      if (applied.has(m.name)) continue;
      await this.#conn.transaction(async () => {
        await m.up(this.#ctx());
        await this.#conn.run(
          `INSERT INTO ${q(this.#table)} (${q("name")}, ${q("applied_at")}) VALUES (${this.#conn.dialect.placeholder(0)}, ${this.#conn.dialect.placeholder(1)})`,
          [m.name, now()],
        );
      });
      done.push(m.name);
      if (opts.to && m.name === opts.to) break;
    }
    return done;
  }

  /**
   * Roll back the last `steps` applied migrations (most-recent first). A
   * migration without a `down` throws. Returns the names rolled back.
   */
  async down(steps = 1): Promise<string[]> {
    const applied = await this.#applied();
    const byName = new Map(this.#migrations.map((m) => [m.name, m]));
    const order = [...applied.keys()].reverse(); // most-recent first
    const q = (s: string) => this.#conn.dialect.quoteId(s);
    const done: string[] = [];
    for (const name of order.slice(0, Math.max(0, steps))) {
      const m = byName.get(name);
      if (!m) throw new Error(`Migrator: applied migration "${name}" is not in the provided list — cannot roll back`);
      if (!m.down) throw new Error(`Migrator: migration "${name}" has no down() — cannot roll back`);
      await this.#conn.transaction(async () => {
        await m.down!(this.#ctx());
        await this.#conn.run(`DELETE FROM ${q(this.#table)} WHERE ${q("name")} = ${this.#conn.dialect.placeholder(0)}`, [name]);
      });
      done.push(name);
    }
    return done;
  }
}

/**
 * Load migrations from a directory: every `*.ts`/`*.js` file (excluding
 * `*.d.ts`), sorted by filename, dynamically imported. Each module's default
 * export (or a named `migration` export) must be a {@link Migration}; `name`
 * falls back to the filename without extension.
 *
 * Node-only (uses `node:fs`) — kept out of the barrel's hot path.
 */
export async function loadMigrations(dir: string): Promise<Migration[]> {
  const { readdirSync } = await import("node:fs");
  const { join, resolve, extname, basename } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const files = readdirSync(dir)
    .filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith(".d.ts"))
    .sort();
  const migrations: Migration[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(resolve(join(dir, file))).href)) as {
      default?: Migration;
      migration?: Migration;
    };
    const m = mod.default ?? mod.migration;
    if (!m || typeof m.up !== "function") continue;
    migrations.push({ name: m.name ?? basename(file, extname(file)), up: m.up, down: m.down });
  }
  return migrations;
}
