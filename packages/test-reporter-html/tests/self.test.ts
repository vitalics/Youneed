// Self-test: run @youneed/test with the HTMLReporter, render to a temp file,
// and assert the HTML reflects the results.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestApplication, expect, type TestContext } from "@youneed/test";
import { HTMLReporter } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};

class Demo extends Test({ name: "Demo" }) {
  @Test.it("passes") a() {
    expect(1 + 1).toBe(2);
  }
  @Test.it("fails") b() {
    expect(1).toBe(2);
  }
  // Simulate what the @youneed/test-plugin-benchmark plugin stashes on metadata, so the
  // HTML reporter's benchmark rendering is exercised without that dependency.
  @Test.it("bench")
  bench(ctx: TestContext) {
    ctx.metadata.benchmark = { name: "loop", samples: 25, hz: 100000, mean: 0.01, p99: 0.02 };
  }
}

const dir = mkdtempSync(join(tmpdir(), "youneed-html-"));
const output = join(dir, "report.html");
const reporter = new HTMLReporter({ output, title: "Demo Report" });
await TestApplication().addTests(Demo).reporter(reporter).run({ setExitCode: false });

const html = readFileSync(output, "utf8");

ok("writes the report file", html.length > 0 && html.startsWith("<!doctype html>"));
ok("includes the custom title", html.includes("Demo Report"));
ok("renders a passing row", html.includes('class="passed"') && html.includes("passes"));
ok("renders a failing row + message", html.includes('class="failed"') && html.includes("expected 1 to be 2"));
ok("renders the benchmark stats", html.includes("⚡") && html.includes("ops/sec"));
ok("renders the summary counts", /\d+ passed/.test(html) && html.includes("total"));
ok("render() also works without a file", new HTMLReporter().render().includes("<!doctype html>"));

rmSync(dir, { recursive: true, force: true });
console.log(`\nall checks passed (${checks})`);
