import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestApplication, NoopReporter } from "@youneed/test";
import { snapshot, toMatchSnapshot } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};

let value: unknown = { name: "alice", roles: ["admin"] };
class S extends Test({ name: "Snap" }) {
  @Test.it("case")
  c() {
    toMatchSnapshot(value);
  }
}
const dir = mkdtempSync(join(tmpdir(), "youneed-snap-"));
const run = (update = false) =>
  TestApplication().addTests(S).use(snapshot({ dir, update })).reporter(new NoopReporter()).run({ setExitCode: false });

const r1 = await run();
const file = join(dir, "Snap.snap.json");
ok("first run records the snapshot + passes", r1.passed === 1);
ok("the snapshot file is written + keyed by test name", JSON.parse(readFileSync(file, "utf8"))["case 1"]?.includes("alice"));

const r2 = await run();
ok("re-running with the same value matches", r2.passed === 1);

value = { name: "bob", roles: ["user"] };
const r3 = await run();
ok("a changed value fails (mismatch)", r3.failed === 1 && /mismatch/.test(r3.results[0].error?.message ?? ""));

const r4 = await run(true); // update mode
ok("update mode overwrites + passes", r4.passed === 1);
ok("the file now holds the new value", JSON.parse(readFileSync(file, "utf8"))["case 1"]?.includes("bob"));

const r5 = await run();
ok("subsequent runs match the updated snapshot", r5.passed === 1);

rmSync(dir, { recursive: true, force: true });
console.log(`\nall checks passed (${checks})`);
