// @youneed/orm-sql — a small SQL ORM on standard TC39 decorators.
export { Table } from "./metadata.ts";
export type {
  ColumnType,
  ColumnMeta,
  ColumnOptions,
  TableOptions,
  IndexMeta,
  IndexOptions,
  RelationKind,
  RelationMeta,
  EntityMeta,
} from "./metadata.ts";
export { getEntityMeta, collectEntity } from "./metadata.ts";

export { sqliteAdapter } from "./adapter.ts";
export type { Adapter, AdapterSettings, Dialect, Driver } from "./adapter.ts";

export { Orm, getConnection, getRepository, Connection, Repository, ReadonlyTableError } from "./orm.ts";
export type {
  OrmSettings,
  QueryRecord,
  OrmInspect,
  OrmTableInfo,
  OrmColumnInfo,
} from "./orm.ts";

export { ormProvider } from "./provider.ts";
export type { OrmProviderOptions, RepositoryMap } from "./provider.ts";

export { Migrator, defineMigration, loadMigrations } from "./migrations.ts";
export type { Migration, MigrationContext, MigrationStatus, MigratorOptions, SchemaBuilder, ColumnDef } from "./migrations.ts";
