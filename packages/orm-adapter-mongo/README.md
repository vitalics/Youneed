# @youneed/orm-adapter-mongo

MongoDB adapter for [`@youneed/orm-nosql`](../orm-nosql), backed by the official
[`mongodb`](https://www.npmjs.com/package/mongodb) driver.

```ts
import { Nosql, Collection, getCollectionRepository } from "@youneed/orm-nosql";
import { mongoAdapter } from "@youneed/orm-adapter-mongo";

class Note extends Collection("notes") {
  @Collection.id() id!: string;
  @Collection.field("string") title!: string;
}

const db = await Nosql({
  adapter: mongoAdapter,
  url: "mongodb://localhost:27017",
  database: "app",
  collections: [Note],
  synchronize: true, // ensures collections + unique indexes
});

const notes = getCollectionRepository(Note);
await notes.insertOne({ title: "Hello" });
await notes.find({ title: { $regex: "^He" } });
```

`type: "mongo"` is **not** built in — pass the adapter explicitly via `adapter`.

## How it maps to Mongo

- orm-nosql's filter operators (`$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`,
  `$nin`, `$exists`, `$regex`) **are** Mongo operators, so filters pass through
  almost untouched.
- The entity's id field (`@Collection.id() id`) maps to Mongo's `_id`. String ids
  shaped like a 24-hex `ObjectId` are coerced to `ObjectId` on the way in, and
  `_id` is stringified back to the logical id on the way out.
- `_id` is immutable: it is stripped from `$set` on update.

## Settings

Pass either a full `url`, or discrete `host` / `port` / `username` / `password`;
`database` selects the DB. Anything else in the settings object is ignored.
