// Entity metadata + the @Table.* decorators. DB-AGNOSTIC: this layer knows
// nothing about SQL — it just records columns/indexes/relations declared on a
// class. (When @youneed/orm-mongo arrives, this file is the shared core to lift
// into @youneed/orm-core.)
//
// Like @youneed/schema, metadata is collected with STANDARD TC39 decorators via
// `context.addInitializer` into a constructor-keyed WeakMap — because TS/esbuild
// only attach `Symbol.metadata` to a class that ALSO has a class decorator, and
// entities are fields-only. The rules land the first time the class is built; the
// ORM constructs one throwaway instance per entity at bootstrap to collect them.
//
// IMPORTANT: standard decorators are NOT valid on `declare` fields ("Decorators
// are not valid here"). Use a definite-assignment field instead:
//     @Table.field("string") userId!: string;   // ✅
//     @Table.field("string") declare userId;     // ❌ won't compile

export type ColumnType =
  | "string"
  | "text"
  | "int"
  | "number"
  | "float"
  | "boolean"
  | "json"
  | "date";

export interface ColumnMeta {
  property: string;
  type: ColumnType;
  primary: boolean;
  /** Auto-generated primary key (AUTOINCREMENT / SERIAL / etc.). */
  generated: boolean;
  nullable: boolean;
  unique: boolean;
  /** Never written by the ORM (insert/update skip it) — e.g. DB-managed columns. */
  readonly: boolean;
  default?: unknown;
}

export interface IndexMeta {
  property: string;
  /** Composite index name — columns sharing a `group` form one index. */
  group?: string;
  unique: boolean;
}

export type RelationKind = "one-to-many" | "many-to-one" | "one-to-one" | "many-to-many";

export interface RelationMeta {
  property: string;
  kind: RelationKind;
  /** Lazy target (avoids circular-import / declaration-order problems). */
  target: () => Function;
  /** Inverse-side selector, e.g. `photo => photo.user`. */
  inverse?: (related: unknown) => unknown;
}

export interface EntityMeta {
  /** Explicit table name (from `Table("name")`), else derived from the class. */
  name?: string;
  columns: Map<string, ColumnMeta>;
  indexes: IndexMeta[];
  relations: Map<string, RelationMeta>;
  /** Block writes through the ORM (views, reference data, replica reads). */
  readonly: boolean;
  /** Whether `synchronize` emits DDL for this entity (false for DB views). */
  synchronize: boolean;
}

const registry = new WeakMap<Function, EntityMeta>();

function metaOf(ctor: Function): EntityMeta {
  let m = registry.get(ctor);
  if (!m)
    registry.set(ctor, (m = { columns: new Map(), indexes: [], relations: new Map(), readonly: false, synchronize: true }));
  return m;
}

/** Column slot for a property (created on first touch). */
function columnSlot(ctor: Function, property: string): ColumnMeta {
  const m = metaOf(ctor);
  let c = m.columns.get(property);
  if (!c)
    m.columns.set(property, (c = { property, type: "string", primary: false, generated: false, nullable: false, unique: false, readonly: false }));
  return c;
}

/** Read collected metadata for an entity class (undefined if never collected). */
export function getEntityMeta(ctor: Function): EntityMeta | undefined {
  return registry.get(ctor);
}

/** Construct a throwaway instance so the field initializers register metadata. */
const collected = new WeakSet<Function>();
export function collectEntity(ctor: Function): EntityMeta {
  if (!registry.has(ctor) && !collected.has(ctor)) {
    collected.add(ctor);
    try {
      new (ctor as new () => unknown)();
    } catch {
      /* entity needs constructor args — keep fields arg-free for collection */
    }
  }
  // Resolve table name + table-level options from the `Table(...)` statics, lazily.
  const m = metaOf(ctor);
  if (m.name === undefined) {
    const s = ctor as { ormTableName?: string; name: string; ormReadonly?: boolean; ormSynchronize?: boolean };
    m.name = s.ormTableName ?? snakeCase(s.name);
    m.readonly = s.ormReadonly ?? false;
    m.synchronize = s.ormSynchronize ?? true;
  }
  return m;
}

function snakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// ── Decorator factories (field-level) ──────────────────────────────────────────

type FieldDecorator = (value: undefined, ctx: ClassFieldDecoratorContext) => void;

/** Register a mutation against this property's column metadata on construction. */
function onColumn(mutate: (c: ColumnMeta) => void): FieldDecorator {
  return (_v, ctx) => {
    if (ctx.kind !== "field") throw new Error("@Table column decorators go on fields");
    const property = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      mutate(columnSlot((this as object).constructor, property));
    });
  };
}

function applyColumnOptions(c: ColumnMeta, opts: Omit<ColumnOptions, "type">): void {
  if (opts.nullable !== undefined) c.nullable = opts.nullable;
  if (opts.unique !== undefined) c.unique = opts.unique;
  if (opts.readonly !== undefined) c.readonly = opts.readonly;
  if (opts.default !== undefined) c.default = opts.default;
}

export interface ColumnOptions {
  type?: ColumnType;
  nullable?: boolean;
  unique?: boolean;
  /** Read-only column: still loaded, but never sent on insert/update. */
  readonly?: boolean;
  default?: unknown;
}

export interface TableOptions {
  /** Block writes (insert/update/delete) through the ORM — views, reference data, replicas. */
  readonly?: boolean;
  /** Whether `synchronize` emits DDL for this entity (default true; set false for DB views). */
  synchronize?: boolean;
}

export interface IndexOptions {
  group?: string;
  unique?: boolean;
}

/**
 * The base every entity extends: `class Users extends Table("users") {}`. The
 * name is optional — it defaults to the snake_cased class name. `Table` also
 * namespaces the column/relation decorators (`@Table.field`, `@Table.index`, …).
 */
export function Table(
  name?: string,
  opts: TableOptions = {},
): { new (): {}; ormTableName?: string } {
  class Entity {}
  const s = Entity as { ormTableName?: string; ormReadonly?: boolean; ormSynchronize?: boolean };
  if (name) s.ormTableName = name;
  if (opts.readonly) s.ormReadonly = true;
  if (opts.synchronize === false) s.ormSynchronize = false;
  return Entity;
}

/** Shorthand column with just a type: `@Table.field("string") name!: string`. */
Table.field = (type: ColumnType, opts: Omit<ColumnOptions, "type"> = {}): FieldDecorator =>
  onColumn((c) => {
    c.type = type;
    applyColumnOptions(c, opts);
  });

/** Full column form: `@Table.column({ default: true })`. */
Table.column = (opts: ColumnOptions = {}): FieldDecorator =>
  onColumn((c) => {
    if (opts.type) c.type = opts.type;
    applyColumnOptions(c, opts);
  });

/** Auto-generated primary key (AUTOINCREMENT / SERIAL, per dialect). */
Table.primaryGeneratedColumn = (type: ColumnType = "int"): FieldDecorator =>
  onColumn((c) => {
    c.primary = true;
    c.generated = true;
    c.type = type;
  });

/** Primary key supplied by the app (e.g. a UUID you set yourself). */
Table.primaryColumn = (type: ColumnType = "string"): FieldDecorator =>
  onColumn((c) => {
    c.primary = true;
    c.type = type;
  });

/** Index a column; columns sharing `group` compose one (optionally unique) index. */
Table.index = (opts: IndexOptions = {}): FieldDecorator =>
  (_v, ctx) => {
    if (ctx.kind !== "field") throw new Error("@Table.index goes on a field");
    const property = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      metaOf((this as object).constructor).indexes.push({ property, group: opts.group, unique: opts.unique ?? false });
    });
  };

function relation(kind: RelationKind) {
  return (target: () => Function, inverse?: (related: never) => unknown): FieldDecorator =>
    (_v, ctx) => {
      if (ctx.kind !== "field") throw new Error("@Table relation decorators go on fields");
      const property = String(ctx.name);
      ctx.addInitializer(function (this: unknown) {
        metaOf((this as object).constructor).relations.set(property, {
          property,
          kind,
          target,
          inverse: inverse as RelationMeta["inverse"],
        });
      });
    };
}

Table.oneToMany = relation("one-to-many");
Table.manyToOne = relation("many-to-one");
Table.oneToOne = relation("one-to-one");
Table.manyToMany = relation("many-to-many");
