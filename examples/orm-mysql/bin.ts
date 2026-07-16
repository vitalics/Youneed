// @youneed/orm-sql + @youneed/orm-adapter-mysql — the global-scope bootstrap.
//
//   Start a MySQL first:
//     docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=test -p 3306:3306 mysql:8
//   Then:
//     pnpm examples:orm:mysql     (override via MYSQL_HOST/PORT/USER/PASSWORD/DB env vars)
//
// Same entities + repository API as the SQLite reference — only the adapter and
// connection settings change.
import { Table, Orm, getRepository } from "@youneed/orm-sql";
import { mysqlAdapter } from "@youneed/orm-adapter-mysql";

class Photo extends Table("photos") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") url!: string;
  @Table.manyToOne(() => UsersTable, (u: UsersTable) => u.photos) user!: UsersTable;
}

class UsersTable extends Table("users") {
  @Table.primaryGeneratedColumn() id!: number;

  @Table.field("string")
  @Table.index({ group: "user_action" })
  userId!: string;

  @Table.field("string", { unique: true }) email!: string;
  @Table.column({ type: "boolean", default: true }) isActive!: boolean;
  @Table.field("json", { nullable: true }) prefs!: unknown;

  @Table.oneToMany(() => Photo, (p: Photo) => p.user) photos!: Photo[];
}

const settings = {
  adapter: mysqlAdapter,
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  username: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "root",
  database: process.env.MYSQL_DB ?? "test",
  tables: [UsersTable, Photo],
  synchronize: true,
};

async function main() {
  const conn = await Orm(settings);
  console.log(`connected to mysql://${settings.host}:${settings.port}/${settings.database}`);

  const users = getRepository(UsersTable);
  const photos = getRepository(Photo);

  const ada = await users.insert({ userId: "u1", email: `ada+${Date.now()}@x.com`, prefs: { theme: "dark" } });
  console.log("inserted user →", ada.id, ada.email, "(isActive default:", ada.isActive, ")");

  await photos.insert({ url: "/ada.jpg", userId: ada.id } as never); // many-to-one FK column "userId"

  const found = await users.findOne({ id: ada.id });
  console.log("findOne →", found?.userId, "prefs:", found?.prefs);
  console.log("users count →", await users.count());
  console.log("ada's photos →", await photos.count({ userId: ada.id } as never));

  await conn.close();
}

main().catch((err: unknown) => {
  // Node throws an AggregateError (empty .message) for ECONNREFUSED on localhost.
  const e = err as { message?: string; code?: string; errors?: Array<{ message?: string }> };
  const reason = e.message || e.errors?.map((x) => x.message).filter(Boolean).join("; ") || e.code || String(err);
  console.error(`\n✗ Could not run against MySQL: ${reason}`);
  console.error("  Start one with:");
  console.error("  docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=test -p 3306:3306 mysql:8");
  process.exit(1);
});
