// MongoDB adapter for @youneed/orm-nosql, backed by the official `mongodb`
// driver. Pass it to `Nosql({ adapter: mongoAdapter, url, database })` — the ORM
// core speaks documents + Mongo-style filters to the DocumentDriver this returns.
//
//   import { mongoAdapter } from "@youneed/orm-adapter-mongo";
//   const db = await Nosql({ adapter: mongoAdapter, url: "mongodb://localhost:27017", database: "app", collections: [Note] });
//
// orm-nosql's filter operators ($gt/$in/$regex/…) ARE Mongo operators, so filters
// pass through almost untouched. The ONE translation: the entity's id field
// (`@Collection.id() id`) maps to Mongo's `_id` — and string ids that look like a
// 24-hex ObjectId are coerced to `ObjectId` so equality/`$in` match documents Mongo
// keyed by ObjectId.
import type {
  AdapterSettings,
  CollectionSpec,
  Doc,
  DocId,
  DocumentAdapter,
  DocumentDriver,
  Filter,
  QueryOptions,
} from "@youneed/orm-nosql";

// ── id ⇄ _id translation (pure; exported for tests) ─────────────────────────────

const HEX24 = /^[0-9a-fA-F]{24}$/;

/** Runtime `ObjectId` constructor, set once the driver connects. Until then (and
 *  in unit tests) ids are left as plain strings. */
let ObjectIdCtor: (new (hex: string) => unknown) & { isValid?(v: unknown): boolean } | undefined;

/** Coerce a logical id value to what Mongo stores: an `ObjectId` for a 24-hex
 *  string (when the driver is loaded), otherwise the value unchanged. */
export function coerceId(value: unknown): unknown {
  if (typeof value === "string" && ObjectIdCtor && HEX24.test(value)) return new ObjectIdCtor(value);
  return value;
}

/** Translate a logical filter to a Mongo filter: rename the entity id field to
 *  `_id` and coerce its scalar / `$in` / `$nin` values to `ObjectId`. Other keys
 *  and operators pass through (orm-nosql operators == Mongo operators). */
export function toMongoFilter(filter: Filter, idField: string): Filter {
  const out: Filter = {};
  for (const key in filter) {
    const value = filter[key];
    if (key !== idField) {
      out[key] = value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const op: Record<string, unknown> = {};
      for (const k in value as Record<string, unknown>) {
        const v = (value as Record<string, unknown>)[k];
        op[k] = k === "$in" || k === "$nin" ? (v as unknown[]).map(coerceId) : coerceId(v);
      }
      out._id = op;
    } else {
      out._id = coerceId(value);
    }
  }
  return out;
}

/** Prepare a document for insert/update: move the logical id into `_id` (coerced)
 *  and drop the logical key. A missing id is left out so Mongo assigns one. */
export function toMongoDoc(doc: Doc, idField: string): Doc {
  const out: Doc = {};
  for (const k in doc) if (k !== idField) out[k] = doc[k];
  const id = doc[idField];
  if (id !== undefined && id !== null && id !== "") out._id = coerceId(id);
  return out;
}

/** Reshape a Mongo document back to the entity shape: expose `_id` as the logical
 *  id (stringified) and drop `_id`. */
export function fromMongoDoc(doc: Doc, idField: string): Doc {
  const out: Doc = {};
  for (const k in doc) if (k !== "_id") out[k] = doc[k];
  if ("_id" in doc) out[idField] = doc._id == null ? doc._id : String(doc._id);
  return out;
}

/** Translate a `{ field: 1 | -1 }` sort spec, renaming the id field to `_id`. */
function toMongoSort(idField: string, sort?: Record<string, 1 | -1>): Record<string, 1 | -1> | undefined {
  if (!sort) return undefined;
  const out: Record<string, 1 | -1> = {};
  for (const k in sort) out[k === idField ? "_id" : k] = sort[k];
  return out;
}

// ── minimal shapes of the mongodb surface we rely on (avoid leaking its types) ──

interface MongoCollection {
  insertMany(docs: Doc[]): Promise<{ insertedIds: Record<number, unknown> }>;
  find(filter: Filter, opts: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number }): { toArray(): Promise<Doc[]> };
  countDocuments(filter: Filter): Promise<number>;
  updateOne(filter: Filter, update: Doc): Promise<{ matchedCount: number; modifiedCount: number }>;
  updateMany(filter: Filter, update: Doc): Promise<{ matchedCount: number; modifiedCount: number }>;
  deleteOne(filter: Filter): Promise<{ deletedCount: number }>;
  deleteMany(filter: Filter): Promise<{ deletedCount: number }>;
  createIndex(spec: Record<string, 1>, opts: { unique: boolean }): Promise<string>;
}
interface MongoDb {
  collection(name: string): MongoCollection;
  listCollections(filter?: unknown, opts?: { nameOnly: boolean }): { toArray(): Promise<Array<{ name: string }>> };
  createCollection(name: string): Promise<unknown>;
}
interface MongoClientLike {
  connect(): Promise<unknown>;
  db(name?: string): MongoDb;
  close(): Promise<void>;
}

/** Build a connection string from discrete settings when no `url` is given. */
function mongoUrl(s: AdapterSettings): string {
  if (typeof s.url === "string") return s.url;
  const auth = s.username ? `${encodeURIComponent(s.username)}:${encodeURIComponent(String(s.password ?? ""))}@` : "";
  return `mongodb://${auth}${s.host ?? "localhost"}:${s.port ?? 27017}`;
}

class MongoDriver implements DocumentDriver {
  readonly name = "mongodb";
  #idFields = new Map<string, string>();

  constructor(
    private client: MongoClientLike,
    private db: MongoDb,
  ) {}

  #idField(collection: string): string {
    return this.#idFields.get(collection) ?? "_id";
  }

  async ensureCollection(name: string, spec: CollectionSpec): Promise<void> {
    this.#idFields.set(name, spec.idField);
    try {
      await this.db.createCollection(name); // idempotent enough; ignore "already exists"
    } catch {
      /* exists */
    }
  }

  async insert(collection: string, docs: Doc[]): Promise<{ insertedIds: DocId[] }> {
    const idField = this.#idField(collection);
    const res = await this.db.collection(collection).insertMany(docs.map((d) => toMongoDoc(d, idField)));
    return { insertedIds: Object.keys(res.insertedIds).map((k) => String(res.insertedIds[Number(k)])) };
  }

  async find(collection: string, filter: Filter, opts: QueryOptions = {}): Promise<Doc[]> {
    const idField = this.#idField(collection);
    const rows = await this.db
      .collection(collection)
      .find(toMongoFilter(filter, idField), { sort: toMongoSort(idField, opts.sort), skip: opts.skip, limit: opts.limit })
      .toArray();
    return rows.map((r) => fromMongoDoc(r, idField));
  }

  async count(collection: string, filter: Filter): Promise<number> {
    return this.db.collection(collection).countDocuments(toMongoFilter(filter, this.#idField(collection)));
  }

  async update(collection: string, filter: Filter, patch: Doc, opts: { multi?: boolean } = {}): Promise<{ matched: number; modified: number }> {
    const idField = this.#idField(collection);
    const f = toMongoFilter(filter, idField);
    const update = { $set: toMongoDoc(patch, idField) };
    // never let $set rewrite the immutable _id
    delete (update.$set as Doc)._id;
    const coll = this.db.collection(collection);
    const r = opts.multi ? await coll.updateMany(f, update) : await coll.updateOne(f, update);
    return { matched: r.matchedCount, modified: r.modifiedCount };
  }

  async delete(collection: string, filter: Filter, opts: { multi?: boolean } = {}): Promise<{ deleted: number }> {
    const f = toMongoFilter(filter, this.#idField(collection));
    const coll = this.db.collection(collection);
    const r = opts.multi ? await coll.deleteMany(f) : await coll.deleteOne(f);
    return { deleted: r.deletedCount };
  }

  async collections(): Promise<string[]> {
    const list = await this.db.listCollections({}, { nameOnly: true }).toArray();
    return list.map((c) => c.name);
  }

  async createIndex(collection: string, fields: string[], opts: { unique: boolean }): Promise<void> {
    const idField = this.#idField(collection);
    const spec: Record<string, 1> = {};
    for (const f of fields) spec[f === idField ? "_id" : f] = 1;
    await this.db.collection(collection).createIndex(spec, { unique: opts.unique });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/** The MongoDB adapter. Connect with `Nosql({ adapter: mongoAdapter, url, database })`. */
export const mongoAdapter: DocumentAdapter = {
  name: "mongodb",
  async connect(settings: AdapterSettings): Promise<DocumentDriver> {
    const mongodb = (await import("mongodb")) as unknown as {
      MongoClient: new (url: string) => MongoClientLike;
      ObjectId: new (hex: string) => unknown;
    };
    ObjectIdCtor = mongodb.ObjectId;
    const client = new mongodb.MongoClient(mongoUrl(settings));
    await client.connect();
    const db = client.db(settings.database);
    return new MongoDriver(client, db);
  },
};
