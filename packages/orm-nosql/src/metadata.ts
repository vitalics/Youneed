// Collection metadata + the @Collection.* decorators. STORE-AGNOSTIC: this layer
// knows nothing about Mongo or any wire format — it just records the fields,
// indexes and references declared on a document class. (Sibling of
// @youneed/orm-sql's metadata.ts; if a shared @youneed/orm-core ever lands, these
// two converge.)
//
// Like @youneed/orm-sql / @youneed/schema, metadata is collected with STANDARD
// TC39 decorators via `context.addInitializer` into a constructor-keyed WeakMap —
// because TS/esbuild only attach `Symbol.metadata` to a class that ALSO has a
// class decorator, and documents are fields-only. The rules land the first time
// the class is built; the ORM constructs one throwaway instance per collection at
// bootstrap to collect them.
//
// IMPORTANT: standard decorators are NOT valid on `declare` fields. Use a
// definite-assignment field instead:
//     @Collection.field("string") title!: string;   // ✅
//     @Collection.field("string") declare title;     // ❌ won't compile

/** Logical field types. `id` is the document key; `object`/`array` hold nested
 *  JSON. (No SQL column types here — documents are schemaless on the wire.) */
export type FieldType = "string" | "number" | "boolean" | "date" | "object" | "array" | "id";

export interface FieldMeta {
  property: string;
  type: FieldType;
  /** The document key (`_id`-style). Exactly one per collection (or none → auto). */
  primary: boolean;
  /** Auto-generated key (the store assigns it when omitted on insert). */
  generated: boolean;
  /** Field may be absent / null. */
  optional: boolean;
  unique: boolean;
  /** Never written by the ORM (insert/update skip it) — store-managed fields. */
  readonly: boolean;
  default?: unknown;
}

export interface IndexMeta {
  property: string;
  /** Composite index name — fields sharing a `group` form one index. */
  group?: string;
  unique: boolean;
}

/** A reference to another collection's document, by its id (Mongo `ObjectId`-style
 *  foreign key). Stored as the property's own value — no embedded join. */
export interface RefMeta {
  property: string;
  /** Lazy target (avoids circular-import / declaration-order problems). */
  target: () => Function;
}

export interface CollectionMeta {
  /** Explicit collection name (from `Collection("name")`), else derived from the class. */
  name?: string;
  fields: Map<string, FieldMeta>;
  indexes: IndexMeta[];
  refs: Map<string, RefMeta>;
  /** Block writes through the ORM (read replicas, reference data). */
  readonly: boolean;
}

const registry = new WeakMap<Function, CollectionMeta>();

function metaOf(ctor: Function): CollectionMeta {
  let m = registry.get(ctor);
  if (!m) registry.set(ctor, (m = { fields: new Map(), indexes: [], refs: new Map(), readonly: false }));
  return m;
}

/** Field slot for a property (created on first touch). */
function fieldSlot(ctor: Function, property: string): FieldMeta {
  const m = metaOf(ctor);
  let f = m.fields.get(property);
  if (!f)
    m.fields.set(property, (f = { property, type: "string", primary: false, generated: false, optional: false, unique: false, readonly: false }));
  return f;
}

/** Read collected metadata for a collection class (undefined if never collected). */
export function getCollectionMeta(ctor: Function): CollectionMeta | undefined {
  return registry.get(ctor);
}

/** Construct a throwaway instance so the field initializers register metadata. */
const collected = new WeakSet<Function>();
export function collectCollection(ctor: Function): CollectionMeta {
  if (!registry.has(ctor) && !collected.has(ctor)) {
    collected.add(ctor);
    try {
      new (ctor as new () => unknown)();
    } catch {
      /* needs constructor args — keep fields arg-free for collection */
    }
  }
  const m = metaOf(ctor);
  if (m.name === undefined) {
    const s = ctor as { ormCollectionName?: string; name: string; ormReadonly?: boolean };
    m.name = s.ormCollectionName ?? camelToKebabPlural(s.name);
    m.readonly = s.ormReadonly ?? false;
  }
  return m;
}

/** `UserProfile` → `user-profiles` (a friendly default collection name). */
function camelToKebabPlural(s: string): string {
  const kebab = s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return kebab.endsWith("s") ? kebab : `${kebab}s`;
}

// ── Decorator factories (field-level) ──────────────────────────────────────────

type FieldDecorator = (value: undefined, ctx: ClassFieldDecoratorContext) => void;

/** Register a mutation against this property's field metadata on construction. */
function onField(mutate: (f: FieldMeta) => void): FieldDecorator {
  return (_v, ctx) => {
    if (ctx.kind !== "field") throw new Error("@Collection field decorators go on fields");
    const property = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      mutate(fieldSlot((this as object).constructor, property));
    });
  };
}

function applyFieldOptions(f: FieldMeta, opts: Omit<FieldOptions, "type">): void {
  if (opts.optional !== undefined) f.optional = opts.optional;
  if (opts.unique !== undefined) f.unique = opts.unique;
  if (opts.readonly !== undefined) f.readonly = opts.readonly;
  if (opts.default !== undefined) f.default = opts.default;
}

export interface FieldOptions {
  type?: FieldType;
  optional?: boolean;
  unique?: boolean;
  /** Read-only field: still loaded, never sent on insert/update. */
  readonly?: boolean;
  default?: unknown;
}

export interface CollectionOptions {
  /** Block writes (insert/update/delete) through the ORM. */
  readonly?: boolean;
}

export interface IndexOptions {
  group?: string;
  unique?: boolean;
}

/**
 * The base every document extends: `class Users extends Collection("users") {}`.
 * The name is optional — it defaults to a kebab-case plural of the class name.
 * `Collection` also namespaces the field decorators (`@Collection.field`, `.id`,
 * `.index`, `.ref`).
 */
export function Collection(
  name?: string,
  opts: CollectionOptions = {},
): { new (): {}; ormCollectionName?: string } {
  class Document {}
  const s = Document as { ormCollectionName?: string; ormReadonly?: boolean };
  if (name) s.ormCollectionName = name;
  if (opts.readonly) s.ormReadonly = true;
  return Document;
}

/** Shorthand field with just a type: `@Collection.field("string") name!: string`. */
Collection.field = (type: FieldType, opts: Omit<FieldOptions, "type"> = {}): FieldDecorator =>
  onField((f) => {
    f.type = type;
    applyFieldOptions(f, opts);
  });

/** Full field form: `@Collection.prop({ default: true })`. */
Collection.prop = (opts: FieldOptions = {}): FieldDecorator =>
  onField((f) => {
    if (opts.type) f.type = opts.type;
    applyFieldOptions(f, opts);
  });

/** The document key. `generated` (default) ⇒ the store assigns it when omitted on
 *  insert; pass `{ generated: false }` for an app-supplied key. */
Collection.id = (opts: { generated?: boolean } = {}): FieldDecorator =>
  onField((f) => {
    f.primary = true;
    f.type = "id";
    f.generated = opts.generated !== false;
  });

/** Index a field; fields sharing `group` compose one (optionally unique) index. */
Collection.index = (opts: IndexOptions = {}): FieldDecorator =>
  (_v, ctx) => {
    if (ctx.kind !== "field") throw new Error("@Collection.index goes on a field");
    const property = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      metaOf((this as object).constructor).indexes.push({ property, group: opts.group, unique: opts.unique ?? false });
    });
  };

/** A reference to another collection's document (stored by its id). */
Collection.ref = (target: () => Function): FieldDecorator =>
  (_v, ctx) => {
    if (ctx.kind !== "field") throw new Error("@Collection.ref goes on a field");
    const property = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      const ctor = (this as object).constructor;
      metaOf(ctor).refs.set(property, { property, target });
      // a ref is also a (string id) field so it round-trips on read/write
      const f = fieldSlot(ctor, property);
      if (f.type === "string") f.type = "id";
    });
  };
