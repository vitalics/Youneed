// Run: pnpm --filter @youneed/orm-sql test:provider
// End-to-end: Orm as a ServerPlugin + ormProvider on a controller (`this.orm`)
// + the devtools `inspect()` payload (query log / schema).
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Controller } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { Table, Orm, getRepository, ormProvider, type Connection } from "../src/index.ts";

class UsersTable extends Table("users") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") name!: string;
}

const orm = await Orm({ type: "sqlite", database: ":memory:", tables: [UsersTable], synchronize: true });
const users = getRepository(UsersTable);

class UsersController extends Controller("/users", {
  providers: [ormProvider(orm, { repositories: { users } })],
}) {
  @Controller.get()
  async list() {
    // `this.orm.users` is typed + autocompletes from the provider contribution.
    return { count: await this.orm.users.count() };
  }
}

class OrmServerSuite extends Test({ name: "orm-sql server integration" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41401";

  @Test.beforeAll() async start() {
    const app = Application(UsersController).plugin(orm); // `orm` is also a ServerPlugin
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41401, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("ormProvider exposes this.orm; count reflects inserts") async count() {
    let r = await fetch(`${this.base}/users`);
    expect((await r.json()).count).toBe(0);
    await users.insert({ name: "ada" });
    r = await fetch(`${this.base}/users`);
    expect((await r.json()).count).toBe(1);
  }

  @Test.it("inspect() describes the schema for the devtools DB monitor") schema() {
    const info = (orm as Connection).inspect();
    expect(info.kind).toBe("orm-sql");
    expect(info.type).toBe("sqlite");
    const t = info.tables.find((x) => x.name === "users");
    expect(t).toBeTruthy();
    expect(t!.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(t!.columns.find((c) => c.name === "id")!.primary).toBe(true);
  }

  @Test.it("inspect() reports the query log + per-op stats") queryLog() {
    const info = (orm as Connection).inspect();
    expect(info.recent.length > 0).toBe(true);
    // CREATE (synchronize) + SELECT (count) + INSERT all recorded.
    expect(info.stats.SELECT?.count ?? 0).toBeGreaterThan(0);
    expect(info.stats.INSERT?.count ?? 0).toBeGreaterThan(0);
    const select = info.recent.find((q) => q.op === "SELECT");
    expect(typeof select!.ms).toBe("number");
  }
}

// ── data browser (dev-only DB studio) ─────────────────────────────────────────
/** True if `p` rejects (the framework's `toThrow` only handles sync functions). */
const rejected = async (p: Promise<unknown>): Promise<boolean> => p.then(() => false, () => true);

class PetsTable extends Table("pets") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") name!: string;
  @Table.field("boolean", { nullable: true }) good!: boolean;
}

const studio = await Orm({ type: "sqlite", database: ":memory:", tables: [PetsTable], synchronize: true, devtools: true });
const ro = await Orm({ type: "sqlite", database: ":memory:", tables: [PetsTable], synchronize: true, devtools: { readonly: true } });
const plain = await Orm({ type: "sqlite", database: ":memory:", tables: [PetsTable], synchronize: true });

class DataBrowserSuite extends Test({ name: "orm-sql data browser" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41402";

  @Test.beforeAll() async start() {
    const app = Application().plugin(studio); // mounts /__orm routes via setup()
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41402, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("inspect() exposes endpoints only when the browser is enabled") endpoints() {
    expect((studio as Connection).inspect().endpoints?.rows).toBe("/__orm/rows");
    expect((studio as Connection).inspect().readonly).toBe(false);
    expect((ro as Connection).inspect().readonly).toBe(true);
    expect((ro as Connection).inspect().endpoints?.insert).toBeUndefined(); // mutation paths omitted
    expect((plain as Connection).inspect().endpoints).toBeUndefined();
  }

  @Test.it("dataTables lists managed tables + physical columns") tables() {
    const tbls = (studio as Connection).dataTables();
    const pets = tbls.find((t) => t.name === "pets");
    expect(pets).toBeTruthy();
    expect(pets!.columns.map((c) => c.name)).toEqual(["id", "name", "good"]);
  }

  @Test.it("insertRow + browse round-trip with pagination + sort") async roundtrip() {
    await (studio as Connection).insertRow("pets", { name: "Rex", good: true });
    await (studio as Connection).insertRow("pets", { name: "Milo", good: false });
    const page = await (studio as Connection).browse("pets", { limit: 1, offset: 0, orderBy: "name", dir: "asc" });
    expect(page.total).toBe(2);
    expect(page.rows.length).toBe(1);
    expect(page.rows[0].name).toBe("Milo"); // alphabetic asc
    expect(page.rows[0].good).toBe(false); // boolean deserialized
  }

  @Test.it("browse search filters rows") async search() {
    const page = await (studio as Connection).browse("pets", { search: "Rex" });
    expect(page.total).toBe(1);
    expect(page.rows[0].name).toBe("Rex");
  }

  @Test.it("runSql returns a result set for SELECT, a summary for mutations") async sql() {
    const sel = await (studio as Connection).runSql("SELECT COUNT(*) AS n FROM pets");
    expect(sel.kind).toBe("select");
    expect(Number(sel.rows![0].n)).toBe(2);
    const mut = await (studio as Connection).runSql("UPDATE pets SET good = 1 WHERE name = ?", ["Milo"]);
    expect(mut.kind).toBe("mutation");
    expect(mut.rowsAffected).toBe(1);
  }

  @Test.it("deleteRows requires a WHERE and removes the matched row") async del() {
    const r = await (studio as Connection).deleteRows("pets", { name: "Rex" });
    expect(r.changes).toBe(1);
    expect(await rejected((studio as Connection).deleteRows("pets", {}))).toBe(true); // refuses to empty the table
  }

  @Test.it("unknown table is rejected (no identifier injection)") async guard() {
    expect(await rejected((studio as Connection).browse("pets; DROP TABLE pets"))).toBe(true);
  }

  @Test.it("read-only browser blocks mutations through runSql") async readonly() {
    const sel = await (ro as Connection).runSql("SELECT 1 AS n");
    expect(sel.kind).toBe("select");
    expect(await rejected((ro as Connection).runSql("DELETE FROM pets"))).toBe(true);
  }

  @Test.it("HTTP: /__orm/tables + /__orm/rows are mounted") async http() {
    const tbls = await (await fetch(`${this.base}/__orm/tables`)).json();
    expect(tbls.tables.some((t: { name: string }) => t.name === "pets")).toBe(true);
    const rows = await (await fetch(`${this.base}/__orm/rows?table=pets&limit=10`)).json();
    expect(typeof rows.total).toBe("number");
    const bad = await (await fetch(`${this.base}/__orm/rows?table=nope`)).json();
    expect(bad.error).toBeTruthy(); // guarded → { error } payload
  }
}

await TestApplication().addTests(OrmServerSuite).addTests(DataBrowserSuite).reporter(new ConsoleReporter()).run();
await orm.close();
await studio.close();
await ro.close();
await plain.close();
