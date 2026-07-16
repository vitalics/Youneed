// Run: pnpm --filter @youneed/orm-sql test
// Migrations end-to-end against a real in-memory SQLite (node:sqlite) — no mocks.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Table, Orm, getRepository, Migrator, defineMigration, type Connection, type Migration } from "../src/index.ts";

class Widget extends Table("widgets") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") name!: string;
}

const init = defineMigration({
  name: "0001_init",
  async up(m) {
    await m.createTable(Widget);
  },
  async down(m) {
    await m.dropTable(Widget);
  },
});

const addColor = defineMigration({
  name: "0002_add_color",
  async up(m) {
    await m.addColumn("widgets", "color", { type: "string", nullable: true });
    await m.createIndex("widgets", ["color"]);
  },
  async down(m) {
    await m.dropIndex("idx_widgets_color");
    await m.dropColumn("widgets", "color");
  },
});

const migrations: Migration[] = [init, addColor];

let conn: Connection;

class MigrationsSuite extends Test({ name: "@youneed/orm-sql migrations (sqlite)" }) {
  @Test.beforeAll() async boot() {
    conn = await Orm({ type: "sqlite", database: ":memory:" }); // no tables/synchronize — migrations own the schema
  }
  @Test.afterAll() async shutdown() {
    await conn.close();
  }

  @Test.it("up() applies all pending migrations in order") async up() {
    const applied = await new Migrator(conn, migrations).up();
    expect(applied).toEqual(["0001_init", "0002_add_color"]);
    // both the table and the added column exist
    const w = await getRepository(Widget).insert({ name: "a" });
    expect(w.id).toBe(1);
    await conn.run(`UPDATE widgets SET color = ? WHERE id = ?`, ["red", 1]);
    const rows = await conn.all<{ color: string }>(`SELECT color FROM widgets WHERE id = 1`, []);
    expect(rows[0]?.color).toBe("red");
  }

  @Test.it("up() is idempotent — re-running applies nothing") async idempotent() {
    const applied = await new Migrator(conn, migrations).up();
    expect(applied).toEqual([]);
  }

  @Test.it("status() reports every migration as applied") async status() {
    const status = await new Migrator(conn, migrations).status();
    expect(status.every((s) => s.applied)).toBeTruthy();
    expect(status.map((s) => s.name)).toEqual(["0001_init", "0002_add_color"]);
    expect(typeof status[0]?.appliedAt).toBe("number");
  }

  @Test.it("down() rolls back the last migration only") async down() {
    const rolled = await new Migrator(conn, migrations).down();
    expect(rolled).toEqual(["0002_add_color"]);
    // the color column is gone → selecting it errors
    let threw = false;
    try {
      await conn.all(`SELECT color FROM widgets`, []);
    } catch {
      threw = true;
    }
    expect(threw).toBeTruthy();
    // 0001 is still applied
    const status = await new Migrator(conn, migrations).status();
    expect(status.find((s) => s.name === "0001_init")?.applied).toBeTruthy();
    expect(status.find((s) => s.name === "0002_add_color")?.applied).toBe(false);
  }

  @Test.it("up() re-applies a rolled-back migration") async reapply() {
    const applied = await new Migrator(conn, migrations).up();
    expect(applied).toEqual(["0002_add_color"]);
  }

  @Test.it("duplicate migration names are rejected") dupes() {
    let threw = false;
    try {
      new Migrator(conn, [init, init]);
    } catch {
      threw = true;
    }
    expect(threw).toBeTruthy();
  }
}

await TestApplication().addTests(MigrationsSuite).reporter(new ConsoleReporter()).run();
