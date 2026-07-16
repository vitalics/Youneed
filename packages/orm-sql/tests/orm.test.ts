// Run: pnpm --filter @youneed/orm-sql test
// End-to-end against a real in-memory SQLite (node:sqlite) — no mocks.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Table, Orm, getRepository, getEntityMeta, ReadonlyTableError, type Connection } from "../src/index.ts";

// ── Entities (the requested syntax, with `!:` since decorators can't go on `declare`) ──
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

// ── readonly variants ──
// Read-only TABLE: created by synchronize, but the ORM refuses writes.
class AuditLog extends Table("audit_log", { readonly: true }) {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") action!: string;
}
// Read-only VIEW: ORM neither creates it (synchronize:false) nor writes to it.
class ActiveUser extends Table("active_users", { readonly: true, synchronize: false }) {
  @Table.field("int") id!: number;
  @Table.field("string") userId!: string;
  @Table.field("boolean") isActive!: boolean;
}
// Column-level read-only: `status` is loaded but never written (DB owns it).
class Account extends Table("accounts") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") name!: string;
  @Table.column({ type: "string", readonly: true, default: "active" }) status!: string;
}

let conn: Connection;

class OrmSuite extends Test({ name: "@youneed/orm-sql (sqlite)" }) {
  @Test.beforeAll() async boot() {
    conn = await Orm({
      type: "sqlite",
      database: ":memory:",
      tables: [UsersTable, Photo, AuditLog, Account, ActiveUser],
      synchronize: true,
    });
    // The view backing the read-only ActiveUser entity (synchronize skipped it).
    await conn.driver.execute("CREATE VIEW IF NOT EXISTS active_users AS SELECT * FROM users WHERE isActive = 1");
  }
  @Test.afterAll() async shutdown() {
    await conn.close();
  }

  @Test.it("collects entity metadata (columns, index, relations)") meta() {
    const m = getEntityMeta(UsersTable)!;
    expect(m.name).toBe("users");
    expect(m.columns.get("id")?.generated).toBeTruthy();
    expect(m.columns.get("email")?.unique).toBeTruthy();
    expect(m.indexes.some((i) => i.group === "user_action")).toBeTruthy();
    expect(m.relations.get("photos")?.kind).toBe("one-to-many");
    expect(getEntityMeta(Photo)!.relations.get("user")?.kind).toBe("many-to-one");
  }

  @Test.it("insert returns the generated primary key") async insert() {
    const u = await getRepository(UsersTable).insert({ userId: "u1", email: "ada@x.com", prefs: { theme: "dark" } });
    expect(typeof u.id).toBe("number");
    expect(u.id > 0).toBeTruthy();
  }

  @Test.it("findOne round-trips, coercing boolean + json") async roundTrip() {
    const repo = getRepository(UsersTable);
    const got = await repo.findOne({ email: "ada@x.com" });
    expect(got?.userId).toBe("u1");
    expect(got?.isActive).toBe(true); // DEFAULT true applied, coerced from INTEGER 1
    expect((got?.prefs as { theme: string }).theme).toBe("dark"); // JSON parsed back
  }

  @Test.it("boolean false persists and reads back as false") async boolFalse() {
    const repo = getRepository(UsersTable);
    await repo.insert({ userId: "u2", email: "grace@x.com", isActive: false });
    const got = await repo.findOne({ userId: "u2" });
    expect(got?.isActive).toBe(false);
  }

  @Test.it("unique constraint is enforced by the DB") async unique() {
    let threw = false;
    try {
      await getRepository(UsersTable).insert({ userId: "dup", email: "ada@x.com" });
    } catch {
      threw = true;
    }
    expect(threw).toBeTruthy();
  }

  @Test.it("update + count") async updateCount() {
    const repo = getRepository(UsersTable);
    const changed = await repo.update({ userId: "u1" }, { userId: "u1b" });
    expect(changed).toBe(1);
    expect(await repo.count()).toBe(2);
    expect(await repo.count({ userId: "u1b" })).toBe(1);
  }

  @Test.it("delete removes rows") async remove() {
    const repo = getRepository(UsersTable);
    const removed = await repo.delete({ userId: "u2" });
    expect(removed).toBe(1);
    expect(await repo.count()).toBe(1);
  }

  @Test.it("many-to-one foreign key column is created + usable") async fk() {
    const users = getRepository(UsersTable);
    const photos = getRepository(Photo);
    const owner = await users.findOne({ userId: "u1b" });
    await photos.insert({ url: "/p.jpg", userId: owner!.id } as never); // FK column "userId"
    const p = await photos.findOne({ userId: owner!.id } as never);
    expect(p?.url).toBe("/p.jpg");
  }

  @Test.it("read-only TABLE: reads work, writes throw ReadonlyTableError") async readonlyTable() {
    const audit = getRepository(AuditLog);
    expect(Array.isArray(await audit.find())).toBeTruthy(); // SELECT is fine
    let err: unknown;
    try {
      await audit.insert({ action: "login" });
    } catch (e) {
      err = e;
    }
    expect(err instanceof ReadonlyTableError).toBeTruthy();
    // update + delete are blocked too
    await audit.update({ id: 1 }, { action: "x" }).then(() => expect(false).toBeTruthy(), () => expect(true).toBeTruthy());
    await audit.delete({ id: 1 }).then(() => expect(false).toBeTruthy(), () => expect(true).toBeTruthy());
  }

  @Test.it("read-only VIEW: synchronize skipped its DDL, the view is queryable") async readonlyView() {
    const rows = await getRepository(ActiveUser).find(); // SELECT from the view
    expect(Array.isArray(rows)).toBeTruthy();
    expect(rows.every((r) => r.isActive === true)).toBeTruthy(); // view filters isActive = 1
  }

  @Test.it("read-only COLUMN is excluded from writes (DB default wins)") async readonlyColumn() {
    const accounts = getRepository(Account);
    const created = await accounts.insert({ name: "acme", status: "hacked" } as never); // status ignored
    const got = await accounts.findOne({ id: created.id });
    expect(got?.status).toBe("active"); // the DEFAULT, not "hacked"
  }
}

await TestApplication().addTests(OrmSuite).reporter(new ConsoleReporter()).run();
