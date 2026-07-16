// Run: pnpm --filter @youneed/orm-adapter-mongo test
// Pure id ⇄ _id translation (no live mongod). With the driver unloaded, ids stay
// plain strings, so these assert the renaming + operator passthrough only.
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { toMongoFilter, toMongoDoc, fromMongoDoc } from "../src/index.ts";

class TranslateSuite extends Test({ name: "orm-adapter-mongo/translate" }) {
  @Test.it("toMongoFilter: renames the id field to _id") renameFilter() {
    expect(toMongoFilter({ id: "abc", name: "Ada" }, "id")).toEqual({ _id: "abc", name: "Ada" });
  }

  @Test.it("toMongoFilter: passes Mongo operators through untouched") operators() {
    const f = toMongoFilter({ age: { $gte: 18 }, name: { $in: ["Ada", "Linus"] } }, "id");
    expect(f).toEqual({ age: { $gte: 18 }, name: { $in: ["Ada", "Linus"] } });
  }

  @Test.it("toMongoFilter: maps $in on the id field onto _id") idIn() {
    expect(toMongoFilter({ id: { $in: ["a", "b"] } }, "id")).toEqual({ _id: { $in: ["a", "b"] } });
  }

  @Test.it("toMongoDoc: moves id into _id, drops the logical key") docIn() {
    expect(toMongoDoc({ id: "x1", title: "Hi" }, "id")).toEqual({ _id: "x1", title: "Hi" });
  }

  @Test.it("toMongoDoc: omits _id when no id supplied (Mongo assigns it)") docInGen() {
    expect(toMongoDoc({ title: "Hi" }, "id")).toEqual({ title: "Hi" });
  }

  @Test.it("fromMongoDoc: exposes _id as the logical id (stringified)") docOut() {
    expect(fromMongoDoc({ _id: 42, title: "Hi" }, "id")).toEqual({ id: "42", title: "Hi" });
  }

  @Test.it("round-trips through in → out") roundTrip() {
    const stored = toMongoDoc({ id: "abc", n: 1 }, "id");
    expect(fromMongoDoc(stored, "id")).toEqual({ id: "abc", n: 1 });
  }
}

await TestApplication().addTests(TranslateSuite).reporter(new ConsoleReporter()).run();
