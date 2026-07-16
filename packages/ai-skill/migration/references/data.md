# Data layer → orm-sql / orm-nosql / kv (TypeORM / Prisma / Mongoose / Sequelize)

Three persistence layers — pick by data shape (full API in the `youneed-orm` skill):
- **@youneed/orm-sql** — relational rows + schema, TypeORM-style `Table` entities on TC39
  decorators, built-in SQLite (`node:sqlite`), pluggable dialect adapters.
- **@youneed/orm-nosql** — schema-light JSON documents + Mongo-operator queries, `Collection`
  entities, built-in in-memory store + `@youneed/orm-adapter-mongo`.
- **@youneed/kv** — ephemeral string/JSON values with TTL (sessions, counters, cache),
  `MemoryKV` + `@youneed/kv-redis`.

Hide the store behind a **repository interface** so callers don't move when the ORM swaps —
this is the strangler seam for data. Verify entity/decorator signatures in the `youneed-orm`
skill (`references/sql.md` / `nosql.md` / `kv.md`) before asserting them.

## TypeORM → @youneed/orm-sql (closest — both TypeORM-style, both decorator entities)

| TypeORM | @youneed/orm-sql |
|---------|------------------|
| `@Entity("users") class User` | `class Users extends Table("users") {}` |
| `@PrimaryGeneratedColumn() id` | `@Table.primaryGeneratedColumn() id!: number;` |
| `@Column({type,unique,default})` | `@Table.Column({type,unique,default})` / `@Table.field("string",{unique})` |
| `new DataSource({type,database,entities,synchronize}).initialize()` | `await Orm({type,database,tables,synchronize})` |
| `getRepository(User)` / `dataSource.getRepository` | `getRepository(Users)` |
| `repo.find({where})` / `findOne` | `repo.find({...})` / `repo.findOne(...)` |
| `repo.save(x)` | `repo.insert(x)` / `repo.update(...)` |
| `@ManyToOne`/`@OneToMany` relations | relation columns — verify support/shape in `sql.md` |
| migrations (`typeorm migration:run`) | `Migrator` + transaction (see `orm-sql` migrations) |

Decorators go on **real initialized fields**, never `declare` fields (TC39 rule). Biggest
port cost is relations and migrations — check what `orm-sql` supports before assuming parity.

## Prisma → @youneed/orm-sql

Prisma is schema-file + generated client; youneed is code-first decorator entities.

| Prisma | @youneed/orm-sql |
|--------|------------------|
| `model User { … }` in `schema.prisma` | `class Users extends Table("users")` with `@Table.*` fields |
| `prisma generate` client | none — the entity class *is* the typed API |
| `prisma.user.findMany({where})` | `getRepository(Users).find({...})` |
| `prisma.user.create({data})` | `repo.insert(data)` |
| `prisma.user.update/delete` | `repo.update(...)` / `repo.delete(...)` |
| `prisma migrate dev` | `Migrator` (hand-authored migrations) |
| `@relation` | relation columns — verify in `sql.md` |

Translate `schema.prisma` into entity classes by hand; there's no schema-file importer. Keep
the generated Prisma client as the old path until the repo swap is proven.

## Sequelize → @youneed/orm-sql

`sequelize.define`/`Model.init` → `Table` entity; `Model.findAll/create/update/destroy` →
`repo.find/insert/update/delete`; `sequelize.sync()` → `synchronize:true` (dev only);
associations → relation columns. Same code-first shape as TypeORM mapping above.

## Mongoose → @youneed/orm-nosql

| Mongoose | @youneed/orm-nosql |
|----------|--------------------|
| `new Schema({...})` + `model("User",s)` | `class Users extends Collection("users") {}` |
| `User.find({age:{$gt:18}})` | `repo.find({age:{$gt:18}})` (same Mongo operators) |
| `User.create(doc)` / `new User().save()` | `repo.insert(doc)` |
| `User.updateOne/deleteOne` | `repo.update(...)` / `repo.delete(...)` |
| `mongoose.connect(uri)` | `Nosql({ adapter: mongoAdapter(uri) })` or in-memory default |
| schema validation / hooks | validate with `@youneed/schema` at the edge; no built-in hooks |

Mongo filter operators carry over; schema enforcement moves to the DTO layer, not the model.

## Redis / node-cache / in-process caches → @youneed/kv

| Old | @youneed/kv |
|-----|-------------|
| `redis.get/set/setex(k,ttl,v)` | `kv.get(k)` / `kv.set(k,v,{ttl})` (MemoryKV or `redisKV`) |
| `node-cache` / `Map` cache | `MemoryKV` (+ `namespaced(kv,"prefix")`) |
| `ioredis` client shared for sessions/rate-limit | `@youneed/kv-redis` `redisKV(...)` behind the same KV contract |
| distributed cache | `createDistributedCache(kv)` (async) |

`kv` is **not** a document store — use `orm-nosql` for queryable documents; use `kv` only for
ephemeral keyed values (sessions, counters, cache, locks).

## Migration tactics

1. **Repo interface first.** Wrap the old ORM behind a repository; callers depend on the
   interface, not the ORM. Swap the implementation underneath.
2. **Translate entities by hand.** No schema-file importer for Prisma/Mongoose — write the
   `Table`/`Collection` classes, keep the old client running until parity holds.
3. **Move validation to the edge.** `@youneed/schema`/`t.*` DTOs validate input; the ORM
   stores. Don't rely on ORM-level hooks/validators — they don't all port.
4. **Migrations are hand-authored.** No `migrate dev` autogen — use `Migrator` + a transaction;
   keep the schema diff explicit.
5. **Dual-read to verify.** During cutover, read from both stores and compare before trusting
   the new one; then flip writes.
