// The contract a document-store adapter implements. Store-specific packages
// (`@youneed/orm-adapter-mongo`, …) export a `DocumentAdapter`; the ORM core
// asks it for a `DocumentDriver` and speaks documents + Mongo-style filters to
// it. A zero-dependency in-memory driver ships here as the reference + test
// engine (full filter/sort/paginate matching done in JS).

/** A document is a plain JSON-ish object. The id field name is configurable per
 *  collection (defaults to the entity's `@Collection.id()` property). */
export type Doc = Record<string, unknown>;
export type DocId = string;

/** A Mongo-style comparison on a single field. */
export interface FieldQuery {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: unknown;
  $gte?: unknown;
  $lt?: unknown;
  $lte?: unknown;
  $in?: unknown[];
  $nin?: unknown[];
  $exists?: boolean;
  /** Source for a `RegExp` test (string match). */
  $regex?: string;
}

/** A query filter: `{ field: value }` (equality) or `{ field: { $gt: … } }`. */
export type Filter = Record<string, unknown | FieldQuery>;

/** Read modifiers. `sort` maps field → 1 (asc) / -1 (desc). */
export interface QueryOptions {
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
}

export interface CollectionSpec {
  /** The document-key field (the entity's `@Collection.id()` property). */
  idField: string;
}

/** A live, low-level document store. Every op is async (network drivers fit too). */
export interface DocumentDriver {
  /** Adapter name (memory / mongo / …) — shown in devtools. */
  readonly name: string;
  /** Register a collection + its id field (idempotent). */
  ensureCollection(name: string, spec: CollectionSpec): Promise<void>;
  /** Insert documents (the driver assigns missing ids); returns the resulting ids. */
  insert(collection: string, docs: Doc[]): Promise<{ insertedIds: DocId[] }>;
  /** Find documents matching `filter`, with optional sort/skip/limit. */
  find(collection: string, filter: Filter, opts?: QueryOptions): Promise<Doc[]>;
  /** Count documents matching `filter`. */
  count(collection: string, filter: Filter): Promise<number>;
  /** Shallow-merge `patch` into documents matching `filter`. */
  update(collection: string, filter: Filter, patch: Doc, opts?: { multi?: boolean }): Promise<{ matched: number; modified: number }>;
  /** Delete documents matching `filter`. */
  delete(collection: string, filter: Filter, opts?: { multi?: boolean }): Promise<{ deleted: number }>;
  /** Known collection names (for the data browser). */
  collections(): Promise<string[]>;
  /** Create an index (advisory for the memory driver; real for Mongo). Optional. */
  createIndex?(collection: string, fields: string[], opts: { unique: boolean }): Promise<void>;
  /** Release any underlying resources (sockets). */
  close(): Promise<void>;
}

export interface AdapterSettings {
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  [k: string]: unknown;
}

/** What a document-store package exports. */
export interface DocumentAdapter {
  name: string;
  connect(settings: AdapterSettings): Promise<DocumentDriver>;
}

// ── filter matching (shared by the memory driver; exported for adapter reuse) ───

const OPS = new Set(["$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists", "$regex"]);

function isQuery(v: unknown): v is FieldQuery {
  if (typeof v !== "object" || v === null || Array.isArray(v) || v instanceof Date) return false;
  return Object.keys(v).some((k) => OPS.has(k));
}

function cmp(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if ((av as never) < (bv as never)) return -1;
  if ((av as never) > (bv as never)) return 1;
  return 0;
}

function matchField(value: unknown, q: FieldQuery): boolean {
  if ("$exists" in q && q.$exists !== (value !== undefined)) return false;
  if ("$eq" in q && cmp(value, q.$eq) !== 0) return false;
  if ("$ne" in q && cmp(value, q.$ne) === 0) return false;
  if ("$gt" in q && !(cmp(value, q.$gt) > 0)) return false;
  if ("$gte" in q && !(cmp(value, q.$gte) >= 0)) return false;
  if ("$lt" in q && !(cmp(value, q.$lt) < 0)) return false;
  if ("$lte" in q && !(cmp(value, q.$lte) <= 0)) return false;
  if (q.$in && !q.$in.some((x) => cmp(value, x) === 0)) return false;
  if (q.$nin && q.$nin.some((x) => cmp(value, x) === 0)) return false;
  if (q.$regex !== undefined && !new RegExp(q.$regex).test(String(value ?? ""))) return false;
  return true;
}

/** Does `doc` satisfy `filter`? Equality for plain values, operators for `{ $op }`. */
export function matchFilter(doc: Doc, filter: Filter): boolean {
  for (const key in filter) {
    const cond = filter[key];
    const value = doc[key];
    if (isQuery(cond)) {
      if (!matchField(value, cond)) return false;
    } else if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
    } else if (cmp(value, cond) !== 0) {
      return false;
    }
  }
  return true;
}

/** Sort `docs` in place by a `{ field: 1 | -1 }` spec. */
export function sortDocs(docs: Doc[], sort?: Record<string, 1 | -1>): Doc[] {
  if (!sort) return docs;
  const keys = Object.keys(sort);
  return docs.sort((a, b) => {
    for (const k of keys) {
      const c = cmp(a[k], b[k]);
      if (c) return c * sort[k];
    }
    return 0;
  });
}

// ── Built-in in-memory document driver ──────────────────────────────────────────

interface MemCollection {
  idField: string;
  docs: Map<DocId, Doc>;
  indexes: Array<{ fields: string[]; unique: boolean }>;
}

let idSeq = 0;
/** Monotonic-ish hex id (deterministic enough for a single process; no crypto dep). */
function genId(): DocId {
  idSeq += 1;
  return (idSeq.toString(16).padStart(8, "0") + (idSeq * 2654435761 % 0xffffffff).toString(16).padStart(8, "0")).slice(0, 24);
}

const clone = <T>(v: T): T => (v == null ? v : (structuredClone(v) as T));

/** In-process `DocumentDriver` backed by `Map`s. The default store — correct for
 *  a single instance / dev / tests, NOT shared across processes. */
export class MemoryDriver implements DocumentDriver {
  readonly name = "memory";
  #colls = new Map<string, MemCollection>();

  #coll(name: string): MemCollection {
    const c = this.#colls.get(name);
    if (!c) throw new Error(`Unknown collection "${name}"`);
    return c;
  }

  async ensureCollection(name: string, spec: CollectionSpec): Promise<void> {
    if (!this.#colls.has(name)) this.#colls.set(name, { idField: spec.idField, docs: new Map(), indexes: [] });
  }

  async insert(collection: string, docs: Doc[]): Promise<{ insertedIds: DocId[] }> {
    const c = this.#coll(collection);
    const insertedIds: DocId[] = [];
    for (const doc of docs) {
      const stored = clone(doc);
      let id = stored[c.idField] as DocId | undefined;
      if (id === undefined || id === null || id === "") {
        id = genId();
        stored[c.idField] = id;
      }
      id = String(id);
      this.#assertUnique(c, stored, id);
      c.docs.set(id, stored);
      insertedIds.push(id);
    }
    return { insertedIds };
  }

  #assertUnique(c: MemCollection, doc: Doc, id: DocId): void {
    for (const ix of c.indexes) {
      if (!ix.unique) continue;
      for (const [otherId, other] of c.docs) {
        if (otherId === id) continue;
        if (ix.fields.every((f) => cmp(other[f], doc[f]) === 0)) {
          throw new Error(`Unique index violation on (${ix.fields.join(", ")}) in "${id}"`);
        }
      }
    }
  }

  async find(collection: string, filter: Filter, opts: QueryOptions = {}): Promise<Doc[]> {
    const c = this.#coll(collection);
    let out = [...c.docs.values()].filter((d) => matchFilter(d, filter));
    sortDocs(out, opts.sort);
    if (opts.skip) out = out.slice(opts.skip);
    if (opts.limit !== undefined) out = out.slice(0, opts.limit);
    return out.map(clone);
  }

  async count(collection: string, filter: Filter): Promise<number> {
    const c = this.#coll(collection);
    let n = 0;
    for (const d of c.docs.values()) if (matchFilter(d, filter)) n += 1;
    return n;
  }

  async update(collection: string, filter: Filter, patch: Doc, opts: { multi?: boolean } = {}): Promise<{ matched: number; modified: number }> {
    const c = this.#coll(collection);
    let matched = 0;
    let modified = 0;
    for (const [id, doc] of c.docs) {
      if (!matchFilter(doc, filter)) continue;
      matched += 1;
      const next = { ...doc, ...clone(patch) };
      next[c.idField] = doc[c.idField]; // id is immutable
      this.#assertUnique(c, next, id);
      c.docs.set(id, next);
      modified += 1;
      if (!opts.multi) break;
    }
    return { matched, modified };
  }

  async delete(collection: string, filter: Filter, opts: { multi?: boolean } = {}): Promise<{ deleted: number }> {
    const c = this.#coll(collection);
    let deleted = 0;
    for (const [id, doc] of [...c.docs]) {
      if (!matchFilter(doc, filter)) continue;
      c.docs.delete(id);
      deleted += 1;
      if (!opts.multi) break;
    }
    return { deleted };
  }

  async collections(): Promise<string[]> {
    return [...this.#colls.keys()];
  }

  async createIndex(collection: string, fields: string[], opts: { unique: boolean }): Promise<void> {
    this.#coll(collection).indexes.push({ fields, unique: opts.unique });
  }

  async close(): Promise<void> {
    this.#colls.clear();
  }
}

/** The built-in adapter — an in-process {@link MemoryDriver}. */
export const memoryAdapter: DocumentAdapter = {
  name: "memory",
  async connect() {
    return new MemoryDriver();
  },
};
