// Self-test: drive @youneed/test with the ConsoleReporter and assert on the
// captured console output.
import assert from "node:assert/strict";
import { Test, TestApplication, expect, type TestContext } from "@youneed/test";
import { ConsoleReporter } from "../src/index.ts";

const realLog = console.log.bind(console);
let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  realLog(`  ✓ ${label}`);
  checks++;
};

// Capture console.log emitted by the reporter during the run.
const lines: string[] = [];
console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));

class Demo extends Test({ name: "Demo" }) {
  @Test.it("passes") a(ctx: TestContext) {
    ctx.annotate("tag", "@smoke");
    expect(1 + 1).toBe(2);
  }
  @Test.it("fails") b() {
    expect(1).toBe(2);
  }
  @Test.skip("skipped") c() {}
}

await TestApplication().addTests(Demo).reporter(new ConsoleReporter()).run({ setExitCode: false });

console.log = realLog;
// Strip ANSI color codes so assertions are color-agnostic.
const out = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");

ok("prints the suite header", out.includes("Demo"));
ok("marks a passing test with ✓", out.includes("✓ passes"));
ok("marks a failing test with ✗", out.includes("✗ fails"));
ok("shows the failure message", out.includes("expected 1 to be 2"));
ok("marks a skipped test with ∘", out.includes("∘") && out.includes("skipped"));
ok("prints test annotations from the context", out.includes("# tag: @smoke"));
ok("prints the final summary", /\d+ passed/.test(out) && out.includes("total"));

realLog(`\nall checks passed (${checks})`);
