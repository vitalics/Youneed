// Live integration test against a REAL MongoDB. NOT part of `pnpm test` — run with
// `pnpm --filter @youneed/orm-adapter-mongo test:live` (optionally MONGO_URL=…).
// Self-skips when no server answers, so it is safe to run anywhere.
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Collection, Nosql, getCollectionRepository, type Connection } from "@youneed/orm-nosql";
import { mongoAdapter } from "../src/index.ts";

const URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const DB = `yn_mongo_test_${Date.now()}`;

async function reachable(): Promise<boolean> {
  try {
    const { MongoClient } = (await import("mongodb")) as unknown as { MongoClient: new (u: string, o: unknown) => { connect(): Promise<unknown>; close(): Promise<void> } };
    const c = new MongoClient(URL, { serverSelectionTimeoutMS: 1500 });
    await c.connect();
    await c.close();
    return true;
  } catch {
    return false;
  }
}

class Note extends Collection("notes") {
  @Collection.id() id!: string;
  @Collection.field("string") title!: string;
  @Collection.field("number") views!: number;
  @Collection.field("string", { unique: true }) @Collection.index({ unique: true }) slug!: string;
}

class LiveSuite extends Test({ name: "orm-adapter-mongo/live" }) {
  #db!: Connection;

  @Test.beforeAll() async start() {
    this.#db = await Nosql({ adapter: mongoAdapter, url: URL, database: DB, collections: [Note], synchronize: true });
  }
  @Test.afterAll() async stop() {
    const repo = getCollectionRepository(Note, this.#db);
    await repo.deleteMany({ views: { $gte: 0 } }).catch(() => {});
    await this.#db.close();
  }

  @Test.it("CRUD round-trip against MongoDB") async crud() {
    const repo = getCollectionRepository(Note, this.#db);
    const n = await repo.insertOne({ title: "Hello", views: 1, slug: "hello" });
    expect(typeof n.id).toBe("string");

    const back = await repo.findById(n.id);
    expect(back?.title).toBe("Hello");

    expect(await repo.updateOne({ id: n.id }, { views: 9 })).toBe(1);
    expect((await repo.findById(n.id))?.views).toBe(9);

    await repo.insertOne({ title: "Two", views: 20, slug: "two" });
    const many = await repo.find({ views: { $gte: 5 } }, { sort: { views: -1 } });
    expect(many[0].slug).toBe("two");

    expect(await repo.deleteMany({ views: { $gte: 0 } })).toBe(2);
    expect(await repo.count()).toBe(0);
  }
}

if (await reachable()) {
  await TestApplication().addTests(LiveSuite).reporter(new ConsoleReporter()).run();
} else {
  console.log(`[orm-adapter-mongo] live test skipped — no MongoDB at ${URL}`);
}
