// @youneed/orm-nosql + @youneed/orm-adapter-mongo — the global-scope bootstrap.
//
//   Start a MongoDB first:
//     docker run --rm -p 27017:27017 mongo:7
//   Then:
//     pnpm examples:orm:mongo     (override via MONGO_URL / MONGO_DB env vars)
//
// Same entities + repository API as the in-memory reference — only the adapter and
// connection settings change. Filters are Mongo-style ($gte, $in, …).
import { Collection, Nosql, getCollectionRepository } from "@youneed/orm-nosql";
import { mongoAdapter } from "@youneed/orm-adapter-mongo";

class User extends Collection("users") {
  @Collection.id() id!: string;
  @Collection.field("string") name!: string;
  @Collection.field("number") age!: number;
  @Collection.field("string", { unique: true }) @Collection.index({ unique: true }) email!: string;
  @Collection.field("array", { optional: true }) roles?: string[];
}

const settings = {
  adapter: mongoAdapter,
  url: process.env.MONGO_URL ?? "mongodb://localhost:27017",
  database: process.env.MONGO_DB ?? "youneed_demo",
  collections: [User],
  synchronize: true, // ensures the collection + its unique index
};

async function main() {
  const db = await Nosql(settings);
  console.log(`connected to ${settings.url}/${settings.database}`);

  const users = getCollectionRepository(User);

  const stamp = Date.now();
  const ada = await users.insertOne({ name: "Ada", age: 36, email: `ada+${stamp}@x.dev`, roles: ["admin"] });
  console.log("inserted →", ada.id, ada.email);

  await users.insertMany([
    { name: "Linus", age: 54, email: `linus+${stamp}@x.dev`, roles: ["maintainer"] },
    { name: "Grace", age: 85, email: `grace+${stamp}@x.dev` },
  ]);

  console.log("findById →", (await users.findById(ada.id))?.name);
  console.log("age >= 50 →", (await users.find({ age: { $gte: 50 } }, { sort: { age: -1 } })).map((u) => u.name));
  console.log("roles $in [admin] →", (await users.find({ roles: { $in: ["admin"] } })).map((u) => u.name));

  await users.updateOne({ id: ada.id }, { age: 37 });
  console.log("after updateOne, ada.age →", (await users.findById(ada.id))?.age);

  console.log("total users →", await users.count());
  const removed = await users.deleteMany({ email: { $regex: `\\+${stamp}@` } });
  console.log("cleaned up →", removed, "docs");

  await db.close();
}

main().catch((err: unknown) => {
  const e = err as { message?: string; code?: string; errors?: Array<{ message?: string }> };
  const reason = e.message || e.errors?.map((x) => x.message).filter(Boolean).join("; ") || e.code || String(err);
  console.error(`\n✗ Could not run against MongoDB: ${reason}`);
  console.error("  Start one with:");
  console.error("  docker run --rm -p 27017:27017 mongo:7");
  process.exit(1);
});
