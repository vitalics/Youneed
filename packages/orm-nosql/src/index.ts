// @youneed/orm-nosql — a small document/NoSQL ORM on standard TC39 decorators.
export { Collection } from "./metadata.ts";
export type {
  FieldType,
  FieldMeta,
  FieldOptions,
  CollectionOptions,
  IndexMeta,
  IndexOptions,
  RefMeta,
  CollectionMeta,
} from "./metadata.ts";
export { getCollectionMeta, collectCollection } from "./metadata.ts";

export { memoryAdapter, MemoryDriver, matchFilter, sortDocs } from "./adapter.ts";
export type { DocumentAdapter, DocumentDriver, AdapterSettings, Doc, DocId, Filter, FieldQuery, QueryOptions, CollectionSpec } from "./adapter.ts";

export {
  Nosql,
  getConnection,
  getCollectionRepository,
  Connection,
  Repository,
  ReadonlyCollectionError,
} from "./nosql.ts";
export type {
  NosqlSettings,
  NosqlDevtoolsOptions,
  OpRecord,
  NosqlInspect,
  NosqlCollectionInfo,
  NosqlFieldInfo,
  NosqlEndpoints,
  BrowseResult,
  BrowseOptions,
} from "./nosql.ts";

export { nosqlProvider } from "./provider.ts";
export type { NosqlProviderOptions, RepositoryMap } from "./provider.ts";
