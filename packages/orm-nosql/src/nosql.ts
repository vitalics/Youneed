// Bootstrap + connection + repository for the document store. Documents + filters
// are handed to the adapter's DocumentDriver, which does the matching (the memory
// driver in JS; a Mongo adapter on the server). CRUD covers a single collection
// (Mongo-style filters, sort/skip/limit). Aggregation pipelines and populate()
// are future work.
import {
  collectCollection,
  getCollectionMeta,
  type CollectionMeta,
  type FieldMeta,
  type FieldType,
} from "./metadata.ts";
import {
  memoryAdapter,
  type DocumentAdapter,
  type DocumentDriver,
  type AdapterSettings,
  type Doc,
  type Filter,
  type QueryOptions,
} from "./adapter.ts";

/** Thrown when a write is attempted on a `readonly` collection. */
export class ReadonlyCollectionError extends Error {
  constructor(readonly collection: string) {
    super(`Collection "${collection}" is read-only — insert/update/delete are not allowed.`);
    this.name = "ReadonlyCollectionError";
  }
}

export interface NosqlSettings extends AdapterSettings {
  /** Built-in `"memory"`, or the name of an adapter package you pass via `adapter`. */
  type?: "memory" | (string & {});
  /** Explicit adapter (from `@youneed/orm-adapter-mongo` etc.). Overrides `type`. */
  adapter?: DocumentAdapter;
  /** Document classes to manage. */
  collections?: Array<new () => object>;
  /** Register collections + their (unique) indexes on connect. */
  synchronize?: boolean;
  /**
   * Mount a dev-only data browser (a Mongo-Compass-style studio) that powers the
   * devtools "NoSQL" tab: browse documents with pagination/sort, run JSON find
   * filters, and insert/update/delete documents. DEV ONLY: never enable in
   * production, or guard the mount path. `true` ⇒ mount at `/__nosql`. Object
   * form configures it.
   */
  devtools?: boolean | NosqlDevtoolsOptions;
}

/** Knobs for the dev-only data browser ({@link NosqlSettings.devtools}). */
export interface NosqlDevtoolsOptions {
  /** Mount prefix for the data-browser routes (default `/__nosql`). */
  path?: string;
  /** Block every mutation — browse + find only. */
  readonly?: boolean;
  /** Hard cap on documents returned per page / query (default 200). */
  maxDocs?: number;
}

let defaultConnection: Connection | undefined;

function resolveAdapter(s: NosqlSettings): DocumentAdapter {
  if (s.adapter) return s.adapter;
  if (!s.type || s.type === "memory") return memoryAdapter;
  throw new Error(
    `No built-in adapter for type "${s.type}". Install @youneed/orm-adapter-${s.type} and pass it as { adapter }.`,
  );
}

/**
 * Bootstrap a connection (the global-scope API):
 *
 *   const db = await Nosql({ type: "memory", collections: [Users], synchronize: true });
 *   const users = getCollectionRepository(Users);   // uses the default connection
 */
export async function Nosql(settings: NosqlSettings): Promise<Connection> {
  const adapter = resolveAdapter(settings);
  const driver = await adapter.connect(settings);
  const metas = new Map<Function, CollectionMeta>();
  for (const c of settings.collections ?? []) metas.set(c, collectCollection(c));
  const conn = new Connection(driver, metas, {
    store: adapter.name,
    database: (settings as { database?: string }).database,
    devtools: settings.devtools,
  });
  if (settings.synchronize) await conn.synchronize();
  defaultConnection = conn;
  return conn;
}

/** The default connection created by the last `Nosql(...)` call. */
export function getConnection(): Connection {
  if (!defaultConnection) throw new Error("Nosql() has not been called — no default connection.");
  return defaultConnection;
}

/** Repository for a collection, against the default (or a given) connection. */
export function getCollectionRepository<E extends object>(Entity: new () => E, conn: Connection = getConnection()): Repository<E> {
  return conn.getRepository(Entity);
}

// ── op log (devtools / monitoring) ─────────────────────────────────────────────

/** A single executed operation, recorded into the connection's ring buffer. */
export interface OpRecord {
  /** Epoch ms when the op finished. */
  at: number;
  /** Operation: find / insert / update / delete / count. */
  op: string;
  collection: string;
  /** The filter (data values, never code) — JSON-safe. */
  filter?: unknown;
  /** Wall-clock duration in milliseconds. */
  ms: number;
  /** Documents returned / inserted / modified / deleted. */
  count?: number;
  /** Error message when the op threw. */
  error?: string;
}

const OP_LOG_CAP = 200;

/** One field in {@link NosqlCollectionInfo}. */
export interface NosqlFieldInfo {
  name: string;
  type: FieldType;
  primary: boolean;
  optional: boolean;
  unique: boolean;
}

/** A managed collection's schema, as surfaced to the devtools monitor. */
export interface NosqlCollectionInfo {
  name: string;
  readonly: boolean;
  idField: string;
  fields: NosqlFieldInfo[];
  indexes: Array<{ property: string; group?: string; unique: boolean }>;
  refs: Array<{ property: string; target?: string }>;
}

/** Server paths the devtools data browser calls back into (present only when
 *  {@link NosqlSettings.devtools} is enabled). Mutation paths omitted in `readonly`. */
export interface NosqlEndpoints {
  collections: string;
  docs: string;
  query: string;
  insert?: string;
  update?: string;
  delete?: string;
}

/** The connection's `inspect()` payload (devtools renderer kind `"orm-nosql"`). */
export interface NosqlInspect {
  kind: "orm-nosql";
  store: string;
  database?: string;
  collections: NosqlCollectionInfo[];
  recent: OpRecord[];
  stats: Record<string, { count: number; totalMs: number; errors: number }>;
  endpoints?: NosqlEndpoints;
  readonly?: boolean;
}

/** One page of documents from a collection ({@link Connection.browse}). */
export interface BrowseResult {
  collection: string;
  fields: NosqlFieldInfo[];
  docs: Doc[];
  total: number;
  limit: number;
  offset: number;
  ms: number;
}

export interface BrowseOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  dir?: "asc" | "desc";
  /** A JSON filter object (Mongo-style). */
  filter?: Filter;
}

// ── Connection ──────────────────────────────────────────────────────────────────

export class Connection {
  /** ServerPlugin name (so `app.plugin(connection)` works). */
  readonly name = "orm-nosql";
  /** Store/adapter label (e.g. "memory" / "mongo"), for the devtools header. */
  readonly store: string;
  /** Database identifier (DSN host / name), for the header. */
  readonly database?: string;

  #log: OpRecord[] = [];
  #stats = new Map<string, { count: number; totalMs: number; errors: number }>();
  /** Resolved data-browser config (undefined ⇒ the dev data browser is off). */
  #dt?: { path: string; readonly: boolean; maxDocs: number };

  constructor(
    readonly driver: DocumentDriver,
    readonly metas: Map<Function, CollectionMeta>,
    info: { store?: string; database?: string; devtools?: boolean | NosqlDevtoolsOptions } = {},
  ) {
    this.store = info.store ?? driver.name;
    this.database = info.database;
    const dt = info.devtools;
    if (dt) {
      const o = typeof dt === "object" ? dt : {};
      this.#dt = { path: o.path ?? "/__nosql", readonly: !!o.readonly, maxDocs: o.maxDocs ?? 200 };
    }
  }

  getRepository<E extends object>(Entity: new () => E): Repository<E> {
    let meta = this.metas.get(Entity) ?? getCollectionMeta(Entity);
    if (!meta) this.metas.set(Entity, (meta = collectCollection(Entity)));
    return new Repository<E>(this, Entity, meta);
  }

  // ── instrumented op execution (Repository goes through these) ─────────────────

  #record(op: string, collection: string, filter: unknown, ms: number, count: number | undefined, error?: string): void {
    this.#log.push({ at: Date.now(), op, collection, filter, ms, count, error });
    if (this.#log.length > OP_LOG_CAP) this.#log.shift();
    const s = this.#stats.get(op) ?? { count: 0, totalMs: 0, errors: 0 };
    s.count++;
    s.totalMs += ms;
    if (error) s.errors++;
    this.#stats.set(op, s);
  }

  /** Run a driver op, timed + logged. */
  async run<T>(op: string, collection: string, filter: unknown, fn: () => Promise<T>, countOf: (r: T) => number | undefined): Promise<T> {
    const t0 = performance.now();
    try {
      const r = await fn();
      this.#record(op, collection, filter, performance.now() - t0, countOf(r));
      return r;
    } catch (e) {
      this.#record(op, collection, filter, performance.now() - t0, undefined, errMsg(e));
      throw e;
    }
  }

  recentOps(): readonly OpRecord[] {
    return this.#log;
  }
  opStats(): Record<string, { count: number; totalMs: number; errors: number }> {
    return Object.fromEntries(this.#stats);
  }

  /** Register every managed collection + its unique indexes (idempotent). */
  async synchronize(): Promise<void> {
    for (const [Entity, meta] of this.metas) {
      collectCollection(Entity);
      await this.driver.ensureCollection(meta.name!, { idField: idField(meta) });
      if (!this.driver.createIndex) continue;
      for (const ix of groupedIndexes(meta)) await this.driver.createIndex(meta.name!, ix.fields, { unique: ix.unique });
    }
  }

  // ── ServerPlugin surface ──────────────────────────────────────────────────────

  async onShutdown(): Promise<void> {
    await this.close();
  }

  /** Serializable description for the devtools monitor (kind "orm-nosql"). */
  inspect(): NosqlInspect {
    const collections: NosqlCollectionInfo[] = [];
    for (const meta of this.metas.values()) {
      const fields: NosqlFieldInfo[] = [...meta.fields.values()].map((f) => ({
        name: f.property,
        type: f.type,
        primary: !!f.primary,
        optional: !!f.optional,
        unique: !!f.unique,
      }));
      const indexes = meta.indexes.map((ix) => ({ property: ix.property, group: ix.group, unique: !!ix.unique }));
      const refs = [...meta.refs.values()].map((r) => ({ property: r.property, target: safeTargetName(r) }));
      collections.push({ name: meta.name!, readonly: meta.readonly, idField: idField(meta), fields, indexes, refs });
    }
    return {
      kind: "orm-nosql",
      store: this.store,
      database: this.database,
      collections,
      recent: [...this.#log].slice(-50).reverse(),
      stats: this.opStats(),
      endpoints: this.#endpoints(),
      readonly: this.#dt?.readonly,
    };
  }

  #endpoints(): NosqlEndpoints | undefined {
    const dt = this.#dt;
    if (!dt) return undefined;
    const e: NosqlEndpoints = { collections: `${dt.path}/collections`, docs: `${dt.path}/docs`, query: `${dt.path}/query` };
    if (!dt.readonly) {
      e.insert = `${dt.path}/insert`;
      e.update = `${dt.path}/update`;
      e.delete = `${dt.path}/delete`;
    }
    return e;
  }

  // ── data browser (dev-only studio behind the devtools "NoSQL" tab) ────────────

  #metaByName(name: string): CollectionMeta | undefined {
    for (const m of this.metas.values()) if (m.name === name) return m;
    return undefined;
  }

  #metaOrThrow(name: string): CollectionMeta {
    const m = this.#metaByName(name);
    if (!m) throw new Error(`Unknown collection "${name}"`);
    return m;
  }

  /** Managed collections for the data-browser list. */
  dataCollections(): Array<{ name: string; readonly: boolean; fields: NosqlFieldInfo[] }> {
    const out: Array<{ name: string; readonly: boolean; fields: NosqlFieldInfo[] }> = [];
    for (const meta of this.metas.values()) {
      const fields: NosqlFieldInfo[] = [...meta.fields.values()].map((f) => ({
        name: f.property,
        type: f.type,
        primary: !!f.primary,
        optional: !!f.optional,
        unique: !!f.unique,
      }));
      out.push({ name: meta.name!, readonly: meta.readonly, fields });
    }
    return out;
  }

  /** A page of documents — paginated, optionally filtered/sorted. */
  async browse(collection: string, opts: BrowseOptions = {}): Promise<BrowseResult> {
    const meta = this.#metaOrThrow(collection);
    const cap = this.#dt?.maxDocs ?? 200;
    const limit = Math.min(Math.max(1, opts.limit ?? 50), cap);
    const offset = Math.max(0, opts.offset ?? 0);
    const filter = opts.filter ?? {};
    const sort = opts.orderBy ? { [opts.orderBy]: opts.dir === "desc" ? (-1 as const) : (1 as const) } : undefined;

    const t0 = performance.now();
    const total = await this.run("count", collection, filter, () => this.driver.count(collection, filter), (n) => n);
    const docs = await this.run(
      "find",
      collection,
      filter,
      () => this.driver.find(collection, filter, { sort, skip: offset, limit }),
      (r) => r.length,
    );
    const ms = performance.now() - t0;
    const fields = this.dataCollections().find((c) => c.name === collection)!.fields;
    return { collection, fields, docs: docs.map((d) => jsonSafe(d) as Doc), total, limit, offset, ms };
  }

  /** Run a JSON find filter from the query console (capped). */
  async runQuery(collection: string, filter: Filter = {}, opts: QueryOptions = {}): Promise<{ docs: Doc[]; total: number; ms: number }> {
    this.#metaOrThrow(collection);
    const cap = this.#dt?.maxDocs ?? 200;
    const t0 = performance.now();
    const total = await this.run("count", collection, filter, () => this.driver.count(collection, filter), (n) => n);
    const docs = await this.run(
      "find",
      collection,
      filter,
      () => this.driver.find(collection, filter, { ...opts, limit: Math.min(opts.limit ?? cap, cap) }),
      (r) => r.length,
    );
    return { docs: docs.map((d) => jsonSafe(d) as Doc), total, ms: performance.now() - t0 };
  }

  async insertDoc(collection: string, doc: Doc): Promise<{ insertedId: string }> {
    const meta = this.#metaOrThrow(collection);
    if (meta.readonly) throw new ReadonlyCollectionError(collection);
    const r = await this.run("insert", collection, undefined, () => this.driver.insert(collection, [coerce(meta, doc)]), (x) => x.insertedIds.length);
    return { insertedId: r.insertedIds[0] };
  }

  async updateDocs(collection: string, filter: Filter, patch: Doc, multi = true): Promise<{ matched: number; modified: number }> {
    const meta = this.#metaOrThrow(collection);
    if (meta.readonly) throw new ReadonlyCollectionError(collection);
    if (!filter || !Object.keys(filter).length) throw new Error("A filter is required for update (refusing to touch every document).");
    return this.run("update", collection, filter, () => this.driver.update(collection, filter, coerce(meta, patch), { multi }), (r) => r.modified);
  }

  async deleteDocs(collection: string, filter: Filter, multi = true): Promise<{ deleted: number }> {
    const meta = this.#metaOrThrow(collection);
    if (meta.readonly) throw new ReadonlyCollectionError(collection);
    if (!filter || !Object.keys(filter).length) throw new Error("A filter is required for delete (refusing to empty the collection).");
    return this.run("delete", collection, filter, () => this.driver.delete(collection, filter, { multi }), (r) => r.deleted);
  }

  // ── ServerPlugin.setup — mount the data-browser routes (dev-only) ─────────────

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
    app.get(`${dt.path}/collections`, () => ({ collections: this.dataCollections(), readonly: dt.readonly }));
    app.get(`${dt.path}/docs`, (ctx) =>
      guard(() =>
        this.browse(String(ctx.query.collection ?? ""), {
          limit: numOr(ctx.query.limit),
          offset: numOr(ctx.query.offset),
          orderBy: ctx.query.orderBy || undefined,
          dir: ctx.query.dir === "desc" ? "desc" : "asc",
          filter: parseFilter(ctx.query.filter),
        }),
      ),
    );
    app.post(`${dt.path}/query`, (ctx) =>
      guard(() => {
        const b = (ctx.body ?? {}) as { collection?: string; filter?: Filter; sort?: Record<string, 1 | -1>; limit?: number };
        if (!b.collection) throw new Error("`collection` is required.");
        return this.runQuery(b.collection, b.filter ?? {}, { sort: b.sort, limit: b.limit });
      }),
    );
    if (!dt.readonly) {
      app.post(`${dt.path}/insert`, (ctx) =>
        guard(() => {
          const b = (ctx.body ?? {}) as { collection?: string; doc?: Doc };
          return this.insertDoc(String(b.collection ?? ""), b.doc ?? {});
        }),
      );
      app.post(`${dt.path}/update`, (ctx) =>
        guard(() => {
          const b = (ctx.body ?? {}) as { collection?: string; filter?: Filter; patch?: Doc };
          return this.updateDocs(String(b.collection ?? ""), b.filter ?? {}, b.patch ?? {});
        }),
      );
      app.post(`${dt.path}/delete`, (ctx) =>
        guard(() => {
          const b = (ctx.body ?? {}) as { collection?: string; filter?: Filter };
          return this.deleteDocs(String(b.collection ?? ""), b.filter ?? {});
        }),
      );
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
    if (defaultConnection === this) defaultConnection = undefined;
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

export class Repository<E extends object> {
  #collection: string;
  #idField: string;
  #fields: Map<string, FieldType>;
  #noWrite = new Set<string>();
  #readonly: boolean;

  constructor(
    private conn: Connection,
    private Entity: new () => E,
    private meta: CollectionMeta,
  ) {
    this.#collection = meta.name!;
    this.#idField = idField(meta);
    this.#readonly = meta.readonly;
    this.#fields = new Map();
    for (const f of meta.fields.values()) {
      this.#fields.set(f.property, f.type);
      if (f.readonly || (f.primary && f.generated)) this.#noWrite.add(f.property);
    }
  }

  #assertWritable(): void {
    if (this.#readonly) throw new ReadonlyCollectionError(this.#collection);
  }

  /** Insert one document; returns the entity with its (possibly generated) id. */
  async insertOne(doc: Partial<E>): Promise<E> {
    this.#assertWritable();
    const out = this.#pick(doc);
    const r = await this.conn.run("insert", this.#collection, undefined, () => this.conn.driver.insert(this.#collection, [out]), (x) => x.insertedIds.length);
    return this.#instance({ ...out, [this.#idField]: r.insertedIds[0] });
  }

  /** Insert many documents; returns the entities with their ids. */
  async insertMany(docs: Array<Partial<E>>): Promise<E[]> {
    this.#assertWritable();
    const picked = docs.map((d) => this.#pick(d));
    const r = await this.conn.run("insert", this.#collection, undefined, () => this.conn.driver.insert(this.#collection, picked), (x) => x.insertedIds.length);
    return picked.map((p, i) => this.#instance({ ...p, [this.#idField]: r.insertedIds[i] }));
  }

  async find(filter: Filter = {}, opts: QueryOptions = {}): Promise<E[]> {
    const docs = await this.conn.run("find", this.#collection, filter, () => this.conn.driver.find(this.#collection, filter, opts), (r) => r.length);
    return docs.map((d) => this.#instance(this.#deserialize(d)));
  }

  async findOne(filter: Filter = {}): Promise<E | null> {
    return (await this.find(filter, { limit: 1 }))[0] ?? null;
  }

  /** Find by document id. */
  async findById(id: string): Promise<E | null> {
    return this.findOne({ [this.#idField]: id } as Filter);
  }

  /** Update the first match; returns documents modified (0 or 1). */
  async updateOne(filter: Filter, patch: Partial<E>): Promise<number> {
    this.#assertWritable();
    const r = await this.conn.run("update", this.#collection, filter, () => this.conn.driver.update(this.#collection, filter, this.#pick(patch, true), { multi: false }), (x) => x.modified);
    return r.modified;
  }

  /** Update every match; returns documents modified. */
  async updateMany(filter: Filter, patch: Partial<E>): Promise<number> {
    this.#assertWritable();
    const r = await this.conn.run("update", this.#collection, filter, () => this.conn.driver.update(this.#collection, filter, this.#pick(patch, true), { multi: true }), (x) => x.modified);
    return r.modified;
  }

  async deleteOne(filter: Filter): Promise<number> {
    this.#assertWritable();
    const r = await this.conn.run("delete", this.#collection, filter, () => this.conn.driver.delete(this.#collection, filter, { multi: false }), (x) => x.deleted);
    return r.deleted;
  }

  async deleteMany(filter: Filter): Promise<number> {
    this.#assertWritable();
    const r = await this.conn.run("delete", this.#collection, filter, () => this.conn.driver.delete(this.#collection, filter, { multi: true }), (x) => x.deleted);
    return r.deleted;
  }

  async count(filter: Filter = {}): Promise<number> {
    return this.conn.run("count", this.#collection, filter, () => this.conn.driver.count(this.#collection, filter), (n) => n);
  }

  /** Keep only known fields; serialize by field type. `forUpdate` drops the id. */
  #pick(values: Partial<E>, forUpdate = false): Doc {
    const out: Doc = {};
    for (const k in values) {
      const type = this.#fields.get(k);
      if (!type) continue;
      if (this.#noWrite.has(k)) continue;
      if (forUpdate && k === this.#idField) continue;
      out[k] = toStore((values as Record<string, unknown>)[k], type);
    }
    return out;
  }

  #deserialize(doc: Doc): Doc {
    const out: Doc = {};
    for (const k in doc) {
      const type = this.#fields.get(k);
      out[k] = type ? fromStore(doc[k], type) : doc[k];
    }
    return out;
  }

  #instance(data: Doc): E {
    return Object.assign(new this.Entity(), data);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function idField(meta: CollectionMeta): string {
  for (const f of meta.fields.values()) if (f.primary) return f.property;
  return "_id";
}

function groupedIndexes(meta: CollectionMeta): Array<{ fields: string[]; unique: boolean }> {
  const groups = new Map<string, { fields: string[]; unique: boolean }>();
  for (const ix of meta.indexes) {
    const key = ix.group ?? ix.property;
    const g = groups.get(key) ?? { fields: [], unique: ix.unique };
    g.fields.push(ix.property);
    g.unique = g.unique || ix.unique;
    groups.set(key, g);
  }
  return [...groups.values()];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function safeTargetName(ref: { target: () => unknown }): string | undefined {
  try {
    return (ref.target() as { name?: string } | undefined)?.name;
  } catch {
    return undefined;
  }
}

/** Coerce a raw document (e.g. from the JSON data browser) against the schema. */
function coerce(meta: CollectionMeta, doc: Doc): Doc {
  const out: Doc = {};
  for (const k in doc) {
    const f = meta.fields.get(k);
    out[k] = f ? toStore(doc[k], f.type) : doc[k];
  }
  return out;
}

function toStore(value: unknown, type: FieldType): unknown {
  if (value === undefined || value === null) return value;
  if (type === "date") return value instanceof Date ? value : new Date(String(value));
  return value;
}

function fromStore(value: unknown, type: FieldType): unknown {
  if (value === undefined || value === null) return value;
  if (type === "date") return value instanceof Date ? value : new Date(String(value));
  return value;
}

function numOr(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a `filter` query-string param as JSON; `{}` on absence/parse error. */
function parseFilter(v: string | undefined): Filter {
  if (!v) return {};
  try {
    const o = JSON.parse(v);
    return o && typeof o === "object" ? (o as Filter) : {};
  } catch {
    return {};
  }
}

/** Make a document JSON-safe for the data-browser grid (Dates → ISO strings). */
function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const k in value as Record<string, unknown>) o[k] = jsonSafe((value as Record<string, unknown>)[k]);
    return o;
  }
  return value;
}
