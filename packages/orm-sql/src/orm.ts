// Bootstrap + connection + repository. SQL is generated here against the
// adapter's Dialect; the adapter only runs it. CRUD covers a single table
// (columns + many-to-one foreign keys). Query builder, eager relation loading,
// and migrations are future work (see README).
import {
  collectEntity,
  getEntityMeta,
  type ColumnMeta,
  type ColumnType,
  type EntityMeta,
} from "./metadata.ts";
import { sqliteAdapter, type Adapter, type AdapterSettings, type Dialect, type Driver } from "./adapter.ts";

/** Thrown when a write is attempted on a `readonly` table. */
export class ReadonlyTableError extends Error {
  constructor(readonly table: string) {
    super(`Table "${table}" is read-only — insert/update/delete are not allowed.`);
    this.name = "ReadonlyTableError";
  }
}

export interface OrmSettings extends AdapterSettings {
  /** Built-in `"sqlite"`, or the name of an adapter package you pass via `adapter`. */
  type?: "sqlite" | (string & {});
  /** Explicit adapter (from `@youneed/orm-adapter-mysql` etc.). Overrides `type`. */
  adapter?: Adapter;
  /** Entity classes to manage. */
  tables?: Array<new () => object>;
  /** Create the tables on connect (CREATE TABLE IF NOT EXISTS — no destructive ALTER). */
  synchronize?: boolean;
  /**
   * Mount a dev-only data browser (an Encore-style "DB studio") that powers the
   * devtools "Database" tab: browse rows with pagination/search/sort, run SQL,
   * and insert/update/delete rows. It executes arbitrary SQL against your
   * database — DEV ONLY: never enable it in production, or guard the mount path.
   * `true` ⇒ mount at `/__orm` with read+write. Object form configures it.
   */
  devtools?: boolean | OrmDevtoolsOptions;
}

/** Knobs for the dev-only data browser ({@link OrmSettings.devtools}). */
export interface OrmDevtoolsOptions {
  /** Mount prefix for the data-browser routes (default `/__orm`). */
  path?: string;
  /** Block every mutation — browse + SELECT/PRAGMA/EXPLAIN console only. */
  readonly?: boolean;
  /** Hard cap on rows returned per page / console query (default 200). */
  maxRows?: number;
}

let defaultConnection: Connection | undefined;

function resolveAdapter(s: OrmSettings): Adapter {
  if (s.adapter) return s.adapter;
  if (!s.type || s.type === "sqlite") return sqliteAdapter;
  throw new Error(
    `No built-in adapter for type "${s.type}". Install @youneed/orm-adapter-${s.type} and pass it as { adapter }.`,
  );
}

/**
 * Bootstrap a connection (the global-scope API):
 *
 *   const conn = await Orm({ type: "sqlite", database: ":memory:", tables: [Users], synchronize: true });
 *   const users = getRepository(Users);   // uses the default connection
 */
export async function Orm(settings: OrmSettings): Promise<Connection> {
  const adapter = resolveAdapter(settings);
  const driver = await adapter.connect(settings);
  const metas = new Map<Function, EntityMeta>();
  for (const t of settings.tables ?? []) metas.set(t, collectEntity(t));
  const conn = new Connection(driver, adapter.dialect, metas, {
    type: settings.type ?? "sqlite",
    database: (settings as { database?: string }).database,
    devtools: settings.devtools,
  });
  if (settings.synchronize) await conn.synchronize();
  defaultConnection = conn;
  return conn;
}

/** The default connection created by the last `Orm(...)` call. */
export function getConnection(): Connection {
  if (!defaultConnection) throw new Error("Orm() has not been called — no default connection.");
  return defaultConnection;
}

/** Repository for an entity, against the default (or a given) connection. */
export function getRepository<E extends object>(Entity: new () => E, conn: Connection = getConnection()): Repository<E> {
  return conn.getRepository(Entity);
}

// ── query log (devtools / monitoring) ─────────────────────────────────────────

/** A single executed statement, recorded into the connection's ring buffer. */
export interface QueryRecord {
  /** Epoch ms when the statement finished. */
  at: number;
  /** Leading SQL keyword, upper-cased: SELECT / INSERT / UPDATE / DELETE / CREATE / … */
  op: string;
  /** The SQL text (parameters are kept separate, never interpolated). */
  sql: string;
  /** Bound parameters, JSON-safe-ish (large/binary values are stringified). */
  params: unknown[];
  /** Wall-clock duration in milliseconds. */
  ms: number;
  /** Rows returned (for `all`) or rows changed (for `run`); `undefined` for DDL. */
  rows?: number;
  /** Error message when the statement threw. */
  error?: string;
}

const QUERY_LOG_CAP = 200;
const opOf = (sql: string): string => (sql.trimStart().split(/\s+/, 1)[0] ?? "").toUpperCase();

/** One column in {@link OrmTableInfo}. */
export interface OrmColumnInfo {
  name: string;
  type: ColumnType;
  primary: boolean;
  nullable: boolean;
  unique: boolean;
  generated: boolean;
}

/** A managed table's schema, as surfaced to the devtools DB monitor. */
export interface OrmTableInfo {
  name: string;
  readonly: boolean;
  synchronize: boolean;
  columns: OrmColumnInfo[];
  relations: Array<{ property: string; kind: string; target?: string }>;
  indexes: Array<{ property: string; group?: string; unique: boolean }>;
}

/** Server paths the devtools data browser calls back into (present only when
 *  {@link OrmSettings.devtools} is enabled). Mutation paths are omitted in
 *  `readonly` mode. */
export interface OrmEndpoints {
  tables: string;
  rows: string;
  query: string;
  insert?: string;
  update?: string;
  delete?: string;
}

/** The connection's `inspect()` payload (devtools renderer kind `"orm-sql"`). */
export interface OrmInspect {
  kind: "orm-sql";
  type: string;
  database?: string;
  tables: OrmTableInfo[];
  recent: QueryRecord[];
  stats: Record<string, { count: number; totalMs: number; errors: number }>;
  /** Data-browser callback paths — present only when the dev data browser is on. */
  endpoints?: OrmEndpoints;
  /** Whether the data browser blocks mutations (drives the UI's read-only state). */
  readonly?: boolean;
}

/** One page of rows from a managed table ({@link Connection.browse}). */
export interface BrowseResult {
  table: string;
  columns: OrmColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  ms: number;
}

/** Options for {@link Connection.browse}. */
export interface BrowseOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  dir?: "asc" | "desc";
  search?: string;
}

/** Result of {@link Connection.runSql} — a result set or a mutation summary. */
export interface SqlResult {
  kind: "select" | "mutation";
  columns?: string[];
  rows?: Record<string, unknown>[];
  /** Total rows the query produced (before the `maxRows` cap), for `select`. */
  total?: number;
  /** Rows changed, for `mutation`. */
  rowsAffected?: number;
  /** Last inserted row id, for `mutation` INSERTs. */
  lastInsertId?: number | null;
  ms: number;
}

// ── Connection ──────────────────────────────────────────────────────────────────

export class Connection {
  /** ServerPlugin name (so `app.plugin(connection)` works). */
  readonly name = "orm-sql";
  /** Adapter type label (e.g. "sqlite"), for the devtools header. */
  readonly type: string;
  /** Database identifier (file path / ":memory:" / DSN host), for the header. */
  readonly database?: string;

  #log: QueryRecord[] = [];
  #stats = new Map<string, { count: number; totalMs: number; errors: number }>();
  /** Resolved data-browser config (undefined ⇒ the dev data browser is off). */
  #dt?: { path: string; readonly: boolean; maxRows: number };

  constructor(
    readonly driver: Driver,
    readonly dialect: Dialect,
    readonly metas: Map<Function, EntityMeta>,
    info: { type?: string; database?: string; devtools?: boolean | OrmDevtoolsOptions } = {},
  ) {
    this.type = info.type ?? "sqlite";
    this.database = info.database;
    const dt = info.devtools;
    if (dt) {
      const o = typeof dt === "object" ? dt : {};
      this.#dt = { path: o.path ?? "/__orm", readonly: !!o.readonly, maxRows: o.maxRows ?? 200 };
    }
  }

  getRepository<E extends object>(Entity: new () => E): Repository<E> {
    let meta = this.metas.get(Entity) ?? getEntityMeta(Entity);
    if (!meta) this.metas.set(Entity, (meta = collectEntity(Entity)));
    return new Repository<E>(this, Entity, meta);
  }

  // ── instrumented statement execution (Repository goes through these) ──────────

  #record(op: string, sql: string, params: unknown[], ms: number, rows: number | undefined, error?: string): void {
    this.#log.push({ at: Date.now(), op, sql, params, ms, rows, error });
    if (this.#log.length > QUERY_LOG_CAP) this.#log.shift();
    const s = this.#stats.get(op) ?? { count: 0, totalMs: 0, errors: 0 };
    s.count++;
    s.totalMs += ms;
    if (error) s.errors++;
    this.#stats.set(op, s);
  }

  /** DDL / no-result statement (timed + logged). */
  async execute(sql: string): Promise<void> {
    const t0 = performance.now();
    try {
      await this.driver.execute(sql);
      this.#record(opOf(sql), sql, [], performance.now() - t0, undefined);
    } catch (e) {
      this.#record(opOf(sql), sql, [], performance.now() - t0, undefined, errMsg(e));
      throw e;
    }
  }

  /** Mutating statement (timed + logged); returns the driver result. */
  async run(sql: string, params: unknown[]): Promise<{ changes: number; lastInsertId: number | bigint | null }> {
    const t0 = performance.now();
    try {
      const r = await this.driver.run(sql, params);
      this.#record(opOf(sql), sql, params, performance.now() - t0, r.changes);
      return r;
    } catch (e) {
      this.#record(opOf(sql), sql, params, performance.now() - t0, undefined, errMsg(e));
      throw e;
    }
  }

  /** Query statement (timed + logged); returns the rows. */
  async all<T>(sql: string, params: unknown[]): Promise<T[]> {
    const t0 = performance.now();
    try {
      const rows = await this.driver.all<T>(sql, params);
      this.#record(opOf(sql), sql, params, performance.now() - t0, rows.length);
      return rows;
    } catch (e) {
      this.#record(opOf(sql), sql, params, performance.now() - t0, undefined, errMsg(e));
      throw e;
    }
  }

  /** Most-recent statements (oldest → newest), capped at {@link QUERY_LOG_CAP}. */
  recentQueries(): readonly QueryRecord[] {
    return this.#log;
  }

  /** Per-op aggregates (count / total ms / errors). */
  queryStats(): Record<string, { count: number; totalMs: number; errors: number }> {
    return Object.fromEntries(this.#stats);
  }

  /** CREATE TABLE / INDEX for every managed entity (idempotent). */
  async synchronize(): Promise<void> {
    for (const [Entity, meta] of this.metas) {
      collectEntity(Entity); // ensure name + table options resolved
      if (meta.synchronize === false) continue; // DB views / externally-managed tables
      await this.execute(this.#createTableSql(meta));
      for (const sql of this.#createIndexSql(meta)) await this.execute(sql);
    }
  }

  /** `CREATE TABLE IF NOT EXISTS` DDL for one entity — public so migrations can
   *  reuse the core generator instead of hand-writing table SQL. */
  createTableSql(Entity: new () => object): string {
    return this.#createTableSql(this.metas.get(Entity) ?? collectEntity(Entity));
  }

  /** `CREATE INDEX` DDL for one entity's declared indexes (public, for migrations). */
  createIndexSql(Entity: new () => object): string[] {
    return this.#createIndexSql(this.metas.get(Entity) ?? collectEntity(Entity));
  }

  /**
   * Run `fn` inside a `BEGIN`/`COMMIT` transaction, rolling back on throw. Uses
   * the single underlying driver session, so awaited statements share the tx.
   *
   * Note: MySQL implicitly commits on DDL (`CREATE`/`ALTER`/`DROP TABLE`), so a
   * failed *schema* migration can't be rolled back there — SQLite and Postgres
   * do wrap DDL transactionally.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.execute("BEGIN");
    try {
      const result = await fn();
      await this.execute("COMMIT");
      return result;
    } catch (e) {
      try {
        await this.execute("ROLLBACK");
      } catch {
        /* the driver may have already aborted the tx */
      }
      throw e;
    }
  }

  // ── ServerPlugin surface (app.plugin(connection)) ─────────────────────────────

  /** Stop background work / release the pool on graceful shutdown. */
  async onShutdown(): Promise<void> {
    await this.close();
  }

  /** Serializable description for the devtools "Database" monitor (kind "orm-sql"). */
  inspect(): OrmInspect {
    const tables: OrmTableInfo[] = [];
    for (const meta of this.metas.values()) {
      const columns = [...meta.columns.values()].map((c) => ({
        name: c.property,
        type: c.type,
        primary: !!c.primary,
        nullable: !!c.nullable,
        unique: !!c.unique,
        generated: !!c.generated,
      }));
      const relations = [...meta.relations.values()].map((r) => ({
        property: r.property,
        kind: r.kind,
        target: safeTargetName(r),
      }));
      const indexes = meta.indexes.map((ix) => ({ property: ix.property, group: ix.group, unique: !!ix.unique }));
      tables.push({ name: meta.name!, readonly: meta.readonly, synchronize: meta.synchronize !== false, columns, relations, indexes });
    }
    return {
      kind: "orm-sql",
      type: this.type,
      database: this.database,
      tables,
      recent: [...this.#log].slice(-50).reverse(), // newest first, last 50
      stats: this.queryStats(),
      endpoints: this.#endpoints(),
      readonly: this.#dt?.readonly,
    };
  }

  /** Data-browser callback paths — only when the dev data browser is enabled. */
  #endpoints(): OrmEndpoints | undefined {
    const dt = this.#dt;
    if (!dt) return undefined;
    const e: OrmEndpoints = { tables: `${dt.path}/tables`, rows: `${dt.path}/rows`, query: `${dt.path}/query` };
    if (!dt.readonly) {
      e.insert = `${dt.path}/insert`;
      e.update = `${dt.path}/update`;
      e.delete = `${dt.path}/delete`;
    }
    return e;
  }

  // ── data browser (dev-only DB studio behind the devtools "Database" tab) ──────
  //
  // All of these validate the table + column names against the managed metadata
  // (never interpolating user identifiers) and parameterize every value. They're
  // gated by the `devtools` option — `setup()` only mounts routes when it's on.

  /** Physical columns of a managed table — entity columns + many-to-one FK
   *  columns (`<property>Id`) — plus its read-only flag. `undefined` if unknown. */
  #physical(name: string): { columns: OrmColumnInfo[]; readonly: boolean } | undefined {
    for (const meta of this.metas.values()) {
      if (meta.name !== name) continue;
      const columns: OrmColumnInfo[] = [];
      for (const c of meta.columns.values())
        columns.push({
          name: c.property,
          type: c.type,
          primary: !!c.primary,
          nullable: !!c.nullable,
          unique: !!c.unique,
          generated: !!c.generated,
        });
      for (const rel of meta.relations.values())
        if (rel.kind === "many-to-one" || rel.kind === "one-to-one")
          columns.push({ name: rel.property + "Id", type: "int", primary: false, nullable: true, unique: false, generated: false });
      return { columns, readonly: meta.readonly };
    }
    return undefined;
  }

  #physicalOrThrow(table: string): { columns: OrmColumnInfo[]; readonly: boolean } {
    const t = this.#physical(table);
    if (!t) throw new Error(`Unknown table "${table}"`);
    return t;
  }

  /** Build a validated `WHERE col = ?` clause from a plain object (unknown keys
   *  are dropped); placeholders start at `offset`. */
  #whereOf(cols: OrmColumnInfo[], where: Record<string, unknown>, offset = 0): { clause: string; params: unknown[] } {
    const q = (s: string) => this.dialect.quoteId(s);
    const byName = new Map(cols.map((c) => [c.name, c.type] as const));
    const keys: string[] = [];
    const params: unknown[] = [];
    for (const k in where) {
      const type = byName.get(k);
      if (!type) continue;
      keys.push(k);
      params.push(toDb(where[k], type));
    }
    if (!keys.length) return { clause: "", params: [] };
    const clause = ` WHERE ${keys.map((k, i) => `${q(k)} = ${this.dialect.placeholder(offset + i)}`).join(" AND ")}`;
    return { clause, params };
  }

  /** Managed tables for the data-browser table list. */
  dataTables(): Array<{ name: string; readonly: boolean; columns: OrmColumnInfo[] }> {
    const out: Array<{ name: string; readonly: boolean; columns: OrmColumnInfo[] }> = [];
    for (const meta of this.metas.values()) {
      const p = this.#physical(meta.name!)!;
      out.push({ name: meta.name!, readonly: p.readonly, columns: p.columns });
    }
    return out;
  }

  /** A page of rows from a managed table — paginated, optionally searched/sorted.
   *  Values are deserialized by column type and made JSON-safe for the grid. */
  async browse(table: string, opts: BrowseOptions = {}): Promise<BrowseResult> {
    const t = this.#physicalOrThrow(table);
    const q = (s: string) => this.dialect.quoteId(s);
    const cap = this.#dt?.maxRows ?? 200;
    const limit = Math.min(Math.max(1, opts.limit ?? 50), cap);
    const offset = Math.max(0, opts.offset ?? 0);

    const params: unknown[] = [];
    let where = "";
    if (opts.search) {
      const terms = t.columns.map((c, i) => `CAST(${q(c.name)} AS TEXT) LIKE ${this.dialect.placeholder(i)}`);
      where = ` WHERE ${terms.join(" OR ")}`;
      for (const _ of t.columns) params.push(`%${opts.search}%`);
    }
    let order = "";
    if (opts.orderBy && t.columns.some((c) => c.name === opts.orderBy))
      order = ` ORDER BY ${q(opts.orderBy)} ${opts.dir === "desc" ? "DESC" : "ASC"}`;

    const t0 = performance.now();
    const countRows = await this.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${q(table)}${where}`, params);
    const total = Number(countRows[0]?.n ?? 0);
    const lim = this.dialect.placeholder(params.length);
    const off = this.dialect.placeholder(params.length + 1);
    const rows = await this.all<Record<string, unknown>>(
      `SELECT * FROM ${q(table)}${where}${order} LIMIT ${lim} OFFSET ${off}`,
      [...params, limit, offset],
    );
    const ms = performance.now() - t0;

    const byName = new Map(t.columns.map((c) => [c.name, c.type] as const));
    const display = rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const k in r) {
        const type = byName.get(k);
        o[k] = jsonSafe(type ? fromDb(r[k], type) : r[k]);
      }
      return o;
    });
    return { table, columns: t.columns, rows: display, total, limit, offset, ms };
  }

  /** Run an arbitrary statement from the SQL console. SELECT/PRAGMA/EXPLAIN/WITH
   *  return a (capped) result set; anything else is a mutation. Mutations throw
   *  when the browser is read-only. */
  async runSql(sql: string, params: unknown[] = []): Promise<SqlResult> {
    const op = opOf(sql);
    const reading = op === "SELECT" || op === "PRAGMA" || op === "EXPLAIN" || op === "WITH";
    if (!reading && this.#dt?.readonly)
      throw new Error("Data browser is read-only — only SELECT / PRAGMA / EXPLAIN are allowed.");
    const t0 = performance.now();
    if (!reading) {
      const r = await this.run(sql, params);
      return { kind: "mutation", rowsAffected: r.changes, lastInsertId: r.lastInsertId == null ? null : Number(r.lastInsertId), ms: performance.now() - t0 };
    }
    const rows = await this.all<Record<string, unknown>>(sql, params);
    const cap = this.#dt?.maxRows ?? 200;
    const capped = rows.slice(0, cap).map((r) => {
      const o: Record<string, unknown> = {};
      for (const k in r) o[k] = jsonSafe(r[k]);
      return o;
    });
    const columns = capped.length ? Object.keys(capped[0]) : [];
    return { kind: "select", columns, rows: capped, total: rows.length, ms: performance.now() - t0 };
  }

  /** Insert a row into a managed table (validated columns; values parameterized). */
  async insertRow(table: string, values: Record<string, unknown>): Promise<{ inserted: Record<string, unknown> }> {
    const t = this.#physicalOrThrow(table);
    if (t.readonly) throw new ReadonlyTableError(table);
    const q = (s: string) => this.dialect.quoteId(s);
    const byName = new Map(t.columns.map((c) => [c.name, c] as const));
    const keys: string[] = [];
    const params: unknown[] = [];
    for (const k in values) {
      const col = byName.get(k);
      if (!col || col.generated) continue; // skip unknown + generated PKs
      keys.push(k);
      params.push(toDb(values[k], col.type));
    }
    if (!keys.length) throw new Error("No writable columns supplied.");
    const sql = `INSERT INTO ${q(table)} (${keys.map(q).join(", ")}) VALUES (${keys.map((_, i) => this.dialect.placeholder(i)).join(", ")})`;
    const r = await this.run(sql, params);
    const inserted: Record<string, unknown> = { ...values };
    const pk = t.columns.find((c) => c.primary && c.generated);
    if (pk && r.lastInsertId != null) inserted[pk.name] = Number(r.lastInsertId);
    return { inserted };
  }

  /** Update rows of a managed table matching `where` with `patch`. */
  async updateRows(table: string, where: Record<string, unknown>, patch: Record<string, unknown>): Promise<{ changes: number }> {
    const t = this.#physicalOrThrow(table);
    if (t.readonly) throw new ReadonlyTableError(table);
    const q = (s: string) => this.dialect.quoteId(s);
    const byName = new Map(t.columns.map((c) => [c.name, c] as const));
    const keys: string[] = [];
    const params: unknown[] = [];
    for (const k in patch) {
      const col = byName.get(k);
      if (!col || col.generated) continue;
      keys.push(k);
      params.push(toDb(patch[k], col.type));
    }
    if (!keys.length) throw new Error("No writable columns supplied.");
    const set = keys.map((k, i) => `${q(k)} = ${this.dialect.placeholder(i)}`).join(", ");
    const w = this.#whereOf(t.columns, where, keys.length);
    if (!w.clause) throw new Error("A WHERE is required for update (refusing to touch every row).");
    const r = await this.run(`UPDATE ${q(table)} SET ${set}${w.clause}`, [...params, ...w.params]);
    return { changes: r.changes };
  }

  /** Delete rows of a managed table matching `where`. */
  async deleteRows(table: string, where: Record<string, unknown>): Promise<{ changes: number }> {
    const t = this.#physicalOrThrow(table);
    if (t.readonly) throw new ReadonlyTableError(table);
    const q = (s: string) => this.dialect.quoteId(s);
    const w = this.#whereOf(t.columns, where);
    if (!w.clause) throw new Error("A WHERE is required for delete (refusing to empty the table).");
    const r = await this.run(`DELETE FROM ${q(table)}${w.clause}`, w.params);
    return { changes: r.changes };
  }

  // ── ServerPlugin.setup — mount the data-browser routes (dev-only) ─────────────

  /** When the `devtools` data browser is enabled, mount its routes so the
   *  devtools "Database" tab can browse rows / run SQL / edit. Typed structurally
   *  so the ORM core never imports `@youneed/server`. Errors come back as
   *  `{ error }` payloads the panel surfaces inline. */
  setup(app: {
    get(path: string, handler: (ctx: { query: Record<string, string> }) => unknown): unknown;
    post(path: string, handler: (ctx: { body: unknown }) => unknown): unknown;
  }): void {
    const dt = this.#dt;
    if (!dt) return;
    const guard = async (fn: () => Promise<unknown>): Promise<unknown> => {
      try {
        return await fn();
      } catch (e) {
        return { error: errMsg(e) };
      }
    };
    app.get(`${dt.path}/tables`, () => ({ tables: this.dataTables(), readonly: dt.readonly }));
    app.get(`${dt.path}/rows`, (ctx) =>
      guard(() =>
        this.browse(String(ctx.query.table ?? ""), {
          limit: numOr(ctx.query.limit),
          offset: numOr(ctx.query.offset),
          orderBy: ctx.query.orderBy || undefined,
          dir: ctx.query.dir === "desc" ? "desc" : "asc",
          search: ctx.query.q || undefined,
        }),
      ),
    );
    app.post(`${dt.path}/query`, (ctx) =>
      guard(() => {
        const b = (ctx.body ?? {}) as { sql?: string; params?: unknown[] };
        if (!b.sql) throw new Error("`sql` is required.");
        return this.runSql(b.sql, b.params ?? []);
      }),
    );
    if (!dt.readonly) {
      app.post(`${dt.path}/insert`, (ctx) =>
        guard(() => {
          const b = (ctx.body ?? {}) as { table?: string; values?: Record<string, unknown> };
          return this.insertRow(String(b.table ?? ""), b.values ?? {});
        }),
      );
      app.post(`${dt.path}/update`, (ctx) =>
        guard(() => {
          const b = (ctx.body ?? {}) as { table?: string; where?: Record<string, unknown>; patch?: Record<string, unknown> };
          return this.updateRows(String(b.table ?? ""), b.where ?? {}, b.patch ?? {});
        }),
      );
      app.post(`${dt.path}/delete`, (ctx) =>
        guard(() => {
          const b = (ctx.body ?? {}) as { table?: string; where?: Record<string, unknown> };
          return this.deleteRows(String(b.table ?? ""), b.where ?? {});
        }),
      );
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
    if (defaultConnection === this) defaultConnection = undefined;
  }

  #createTableSql(meta: EntityMeta): string {
    const q = (s: string) => this.dialect.quoteId(s);
    const defs: string[] = [];
    for (const c of meta.columns.values()) {
      if (c.generated && c.primary) {
        defs.push(`${q(c.property)} ${this.dialect.primaryGenerated(c.type)}`);
        continue;
      }
      let def = `${q(c.property)} ${this.dialect.columnType(c.type)}`;
      if (c.primary) def += " PRIMARY KEY";
      if (!c.nullable && !c.primary) def += " NOT NULL";
      if (c.unique && !c.primary) def += " UNIQUE";
      if (c.default !== undefined) def += ` DEFAULT ${sqlLiteral(c.default, c.type)}`;
      defs.push(def);
    }
    // many-to-one → a foreign-key column `<property>Id` (referenced lazily).
    for (const rel of meta.relations.values()) {
      if (rel.kind !== "many-to-one" && rel.kind !== "one-to-one") continue;
      const targetMeta = collectEntity(rel.target());
      const targetPk = primaryColumn(targetMeta);
      defs.push(`${q(rel.property + "Id")} ${this.dialect.columnType(targetPk?.type ?? "int")}`);
    }
    return `CREATE TABLE IF NOT EXISTS ${q(meta.name!)} (${defs.join(", ")})`;
  }

  #createIndexSql(meta: EntityMeta): string[] {
    const q = (s: string) => this.dialect.quoteId(s);
    // Group composite indexes by `group`; ungrouped indexes stand alone.
    const groups = new Map<string, { cols: string[]; unique: boolean }>();
    for (const ix of meta.indexes) {
      const key = ix.group ?? ix.property;
      const g = groups.get(key) ?? { cols: [], unique: ix.unique };
      g.cols.push(ix.property);
      g.unique = g.unique || ix.unique;
      groups.set(key, g);
    }
    const out: string[] = [];
    for (const [key, g] of groups) {
      const name = `idx_${meta.name}_${key}`;
      // Dialect override (MySQL has no `IF NOT EXISTS` on indexes); else standard.
      out.push(
        this.dialect.createIndex
          ? this.dialect.createIndex(meta.name!, name, g.cols, g.unique)
          : `CREATE ${g.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${q(name)} ON ${q(meta.name!)} (${g.cols.map(q).join(", ")})`,
      );
    }
    return out;
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

type Where<E> = Partial<E>;

export class Repository<E extends object> {
  #table: string;
  /** column name → logical type (entity columns + many-to-one FK columns). */
  #cols: Map<string, ColumnType>;
  /** columns excluded from writes (generated PKs + readonly columns). */
  #noWrite = new Set<string>();
  #readonly: boolean;
  #pk?: ColumnMeta;

  constructor(
    private conn: Connection,
    private Entity: new () => E,
    private meta: EntityMeta,
  ) {
    this.#table = meta.name!;
    this.#readonly = meta.readonly;
    this.#cols = new Map();
    for (const c of meta.columns.values()) {
      this.#cols.set(c.property, c.type);
      if (c.generated || c.readonly) this.#noWrite.add(c.property);
    }
    for (const rel of meta.relations.values()) {
      if (rel.kind === "many-to-one" || rel.kind === "one-to-one") this.#cols.set(rel.property + "Id", "int");
    }
    this.#pk = primaryColumn(meta);
  }

  #assertWritable(): void {
    if (this.#readonly) throw new ReadonlyTableError(this.#table);
  }

  /** Insert a row; returns the entity with its (possibly generated) primary key. */
  async insert(values: Partial<E>): Promise<E> {
    this.#assertWritable();
    const { keys, params } = this.#pick(values);
    const q = (s: string) => this.conn.dialect.quoteId(s);
    const cols = keys.map(q).join(", ");
    const ph = keys.map((_, i) => this.conn.dialect.placeholder(i)).join(", ");
    const sql = `INSERT INTO ${q(this.#table)} (${cols}) VALUES (${ph})`;
    const r = await this.conn.run(sql, params);
    const out = { ...values } as Record<string, unknown>;
    if (this.#pk?.generated && r.lastInsertId != null) out[this.#pk.property] = Number(r.lastInsertId);
    return this.#instance(out);
  }

  async find(where?: Where<E>): Promise<E[]> {
    const q = (s: string) => this.conn.dialect.quoteId(s);
    const { clause, params } = this.#where(where);
    const rows = await this.conn.all<Record<string, unknown>>(`SELECT * FROM ${q(this.#table)}${clause}`, params);
    return rows.map((row) => this.#instance(this.#deserialize(row)));
  }

  async findOne(where: Where<E>): Promise<E | null> {
    return (await this.find(where))[0] ?? null;
  }

  async update(where: Where<E>, patch: Partial<E>): Promise<number> {
    this.#assertWritable();
    const q = (s: string) => this.conn.dialect.quoteId(s);
    const { keys, params } = this.#pick(patch);
    const set = keys.map((k, i) => `${q(k)} = ${this.conn.dialect.placeholder(i)}`).join(", ");
    const w = this.#where(where, keys.length);
    const r = await this.conn.run(`UPDATE ${q(this.#table)} SET ${set}${w.clause}`, [...params, ...w.params]);
    return r.changes;
  }

  async delete(where: Where<E>): Promise<number> {
    this.#assertWritable();
    const q = (s: string) => this.conn.dialect.quoteId(s);
    const { clause, params } = this.#where(where);
    const r = await this.conn.run(`DELETE FROM ${q(this.#table)}${clause}`, params);
    return r.changes;
  }

  async count(where?: Where<E>): Promise<number> {
    const q = (s: string) => this.conn.dialect.quoteId(s);
    const { clause, params } = this.#where(where);
    const rows = await this.conn.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${q(this.#table)}${clause}`, params);
    return Number(rows[0]?.n ?? 0);
  }

  // Keep only keys that map to real columns; serialize by column type.
  #pick(values: Partial<E>): { keys: string[]; params: unknown[] } {
    const keys: string[] = [];
    const params: unknown[] = [];
    for (const k in values) {
      const type = this.#cols.get(k);
      if (!type || this.#noWrite.has(k)) continue; // skip relations/unknown + generated/readonly
      keys.push(k);
      params.push(toDb((values as Record<string, unknown>)[k], type));
    }
    return { keys, params };
  }

  #where(where: Where<E> | undefined, offset = 0): { clause: string; params: unknown[] } {
    if (!where) return { clause: "", params: [] };
    const q = (s: string) => this.conn.dialect.quoteId(s);
    const keys: string[] = [];
    const params: unknown[] = [];
    for (const k in where) {
      const type = this.#cols.get(k);
      if (!type) continue;
      keys.push(k);
      params.push(toDb((where as Record<string, unknown>)[k], type));
    }
    if (!keys.length) return { clause: "", params: [] };
    const clause = ` WHERE ${keys.map((k, i) => `${q(k)} = ${this.conn.dialect.placeholder(offset + i)}`).join(" AND ")}`;
    return { clause, params };
  }

  #deserialize(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k in row) {
      const type = this.#cols.get(k);
      out[k] = type ? fromDb(row[k], type) : row[k];
    }
    return out;
  }

  #instance(data: Record<string, unknown>): E {
    return Object.assign(new this.Entity(), data);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function primaryColumn(meta: EntityMeta): ColumnMeta | undefined {
  for (const c of meta.columns.values()) if (c.primary) return c;
  return undefined;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// A relation's target name without throwing if the lazy target isn't resolvable yet.
function safeTargetName(rel: { target: () => unknown }): string | undefined {
  try {
    const t = rel.target() as { name?: string } | undefined;
    return t?.name;
  } catch {
    return undefined;
  }
}

function toDb(value: unknown, type: ColumnType): unknown {
  if (value === undefined || value === null) return null;
  if (type === "boolean") return value ? 1 : 0;
  if (type === "json") return JSON.stringify(value);
  if (type === "date") return value instanceof Date ? value.getTime() : value;
  return value;
}

function fromDb(value: unknown, type: ColumnType): unknown {
  if (value === undefined || value === null) return value;
  if (type === "boolean") return Boolean(value);
  if (type === "json") return typeof value === "string" ? JSON.parse(value) : value;
  if (type === "date") return new Date(Number(value));
  return value;
}

/** Parse a query-string number, or `undefined` if absent/NaN. */
function numOr(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Make a deserialized value safe to JSON-encode for the data-browser grid:
 *  Dates → ISO strings, objects → kept (JSON.stringify handles them), bigint →
 *  string (JSON can't encode bigint). */
function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
}

function sqlLiteral(value: unknown, type: ColumnType): string {
  const v = toDb(value, type);
  if (v === null) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}
