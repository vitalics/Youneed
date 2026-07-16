// Run: pnpm --filter @youneed/orm-nosql test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { Collection, Nosql, getCollectionRepository, type Connection, type NosqlInspect } from "../src/index.ts";

class User extends Collection("users") {
  @Collection.id() id!: string;
  @Collection.field("string") name!: string;
  @Collection.field("number") age!: number;
  @Collection.field("string", { unique: true }) @Collection.index({ unique: true }) email!: string;
}

class NosqlSuite extends Test({ name: "orm-nosql" }) {
  #conn!: Connection;
  #server!: HTTP;
  base = "http://127.0.0.1:41330";

  @Test.beforeAll() async start() {
    this.#conn = await Nosql({ type: "memory", collections: [User], synchronize: true, devtools: true });
    const repo = getCollectionRepository(User, this.#conn);
    await repo.insertMany([
      { name: "Ada", age: 36, email: "ada@x.dev" },
      { name: "Linus", age: 54, email: "linus@x.dev" },
      { name: "Grace", age: 85, email: "grace@x.dev" },
    ]);
    const app = Application().plugin(this.#conn);
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41330, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
    await this.#conn.close();
  }

  @Test.it("insert assigns a generated id; findById round-trips") async ids() {
    const repo = getCollectionRepository(User, this.#conn);
    const u = await repo.insertOne({ name: "Margaret", age: 70, email: "margaret@x.dev" });
    expect(typeof u.id === "string" && u.id.length > 0).toBeTruthy();
    const back = await repo.findById(u.id);
    expect(back?.name).toBe("Margaret");
    await repo.deleteOne({ id: u.id });
  }

  @Test.it("find with a Mongo-style operator filter") async operators() {
    const repo = getCollectionRepository(User, this.#conn);
    const old = await repo.find({ age: { $gte: 50 } }, { sort: { age: 1 } });
    expect(old.length).toBe(2);
    expect(old[0].name).toBe("Linus");
    const ada = await repo.find({ name: "Ada" });
    expect(ada.length).toBe(1);
  }

  @Test.it("$in / count") async inCount() {
    const repo = getCollectionRepository(User, this.#conn);
    const some = await repo.find({ name: { $in: ["Ada", "Grace"] } });
    expect(some.length).toBe(2);
    expect(await repo.count()).toBe(3);
  }

  @Test.it("updateOne modifies; deleteMany removes") async mutate() {
    const repo = getCollectionRepository(User, this.#conn);
    const tmp = await repo.insertOne({ name: "Temp", age: 1, email: "temp@x.dev" });
    expect(await repo.updateOne({ id: tmp.id }, { age: 2 })).toBe(1);
    expect((await repo.findById(tmp.id))?.age).toBe(2);
    expect(await repo.deleteMany({ name: "Temp" })).toBe(1);
  }

  @Test.it("unique index rejects a duplicate") async unique() {
    const repo = getCollectionRepository(User, this.#conn);
    let threw = false;
    try {
      await repo.insertOne({ name: "Dup", age: 9, email: "ada@x.dev" });
    } catch {
      threw = true;
    }
    expect(threw).toBeTruthy();
  }

  @Test.it("inspect(): kind orm-nosql with collections + endpoints") inspect() {
    const info = this.#conn.inspect();
    expect(info.kind).toBe("orm-nosql");
    expect(info.collections.some((c) => c.name === "users")).toBeTruthy();
    expect(typeof info.endpoints?.docs).toBe("string");
  }

  @Test.it("data browser: /collections + /docs") async browse() {
    const colls = (await (await fetch(`${this.base}/__nosql/collections`)).json()) as { collections: Array<{ name: string }> };
    expect(colls.collections.some((c) => c.name === "users")).toBeTruthy();
    const docs = (await (await fetch(`${this.base}/__nosql/docs?collection=users&orderBy=age&dir=desc`)).json()) as { docs: Array<{ name: string }>; total: number };
    expect(docs.total).toBe(3);
    expect(docs.docs[0].name).toBe("Grace"); // oldest first
  }

  @Test.it("data browser: insert → query → delete via routes") async browseWrite() {
    const ins = await fetch(`${this.base}/__nosql/insert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collection: "users", doc: { name: "Katherine", age: 100, email: "kat@x.dev" } }),
    });
    expect((await ins.json() as { insertedId?: string }).insertedId).toBeTruthy();

    const q = await fetch(`${this.base}/__nosql/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collection: "users", filter: { name: "Katherine" } }),
    });
    const found = (await q.json()) as { docs: Array<{ email: string }> };
    expect(found.docs[0].email).toBe("kat@x.dev");

    const del = await fetch(`${this.base}/__nosql/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collection: "users", filter: { name: "Katherine" } }),
    });
    expect((await del.json() as { deleted: number }).deleted).toBe(1);
  }

  @Test.it("topology().plugins exposes inspect() with kind orm-nosql") topologyInspect() {
    const app = Application().plugin(this.#conn);
    const entry = app.topology().plugins.find((p) => p.name === "orm-nosql");
    expect((entry?.info as NosqlInspect | undefined)?.kind).toBe("orm-nosql");
  }
}

await TestApplication().addTests(NosqlSuite).reporter(new ConsoleReporter()).run();
