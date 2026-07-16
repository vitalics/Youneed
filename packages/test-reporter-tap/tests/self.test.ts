import assert from "node:assert/strict";
import { Test, TestApplication, expect } from "@youneed/test";
import { TapReporter } from "../src/index.ts";

const realLog = console.log.bind(console);
let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  realLog(`  ✓ ${label}`);
  checks++;
};

class Demo extends Test({ name: "Demo" }) {
  @Test.it("passes") a() {}
  @Test.it("fails") b() {
    expect(1).toBe(2);
  }
  @Test.skip("skipped") c() {}
}

const lines: string[] = [];
console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
await TestApplication().addTests(Demo).reporter(new TapReporter()).run({ setExitCode: false });
console.log = realLog;
const out = lines.join("\n");

ok("emits the TAP version header", out.startsWith("TAP version 13"));
ok("a passing test is `ok N - …`", out.includes("ok 1 - Demo > passes"));
ok("a failing test is `not ok N - …`", out.includes("not ok 2 - Demo > fails"));
ok("a failure carries a YAML diagnostic", out.includes("---") && out.includes("message:"));
ok("a skipped test is `ok N … # SKIP`", /ok \d+ - Demo > skipped # SKIP/.test(out));
ok("ends with the plan 1..N", out.includes("1..3"));
ok("prints the summary counts", out.includes("# pass 1") && out.includes("# fail 1") && out.includes("# skip 1"));

realLog(`\nall checks passed (${checks})`);
