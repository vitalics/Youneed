// Self-test: a parallel run drives the live ProgressReporter; assert the
// captured output shows per-lane progress.
import assert from "node:assert/strict";
import { Test, TestApplication } from "@youneed/test";
import { ProgressReporter } from "../src/index.ts";

const realLog = console.log.bind(console);
let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  realLog(`  ✓ ${label}`);
  checks++;
};

const capture = async (fn: () => Promise<unknown>) => {
  const lines: string[] = [];
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.log = realLog;
  }
  return lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
};

class A extends Test({ name: "Alpha" }) {
  @Test.it("a1") a1() {}
}
class B extends Test({ name: "Beta" }) {
  @Test.it("b1") b1() {}
}

// ── parallel: progress lines are tagged per lane ──────────────────────────────
{
  const out = await capture(() =>
    TestApplication().addTests(A, B).parallel(2).reporter(new ProgressReporter()).run({ setExitCode: false }),
  );
  ok("emits live progress while parallel lanes run", out.includes("▶"));
  ok("tags progress with the lane (p1/2 + p2/2)", out.includes("[p1/2]") && out.includes("[p2/2]"));
  ok("shows the test identity (suite › name)", out.includes("Alpha › a1") && out.includes("Beta › b1"));
  ok("shows pass marks on testEnd", out.includes("✓"));
}

// ── sequential: no lane tag (single lane) ─────────────────────────────────────
{
  const out = await capture(() =>
    TestApplication().addTests(A).reporter(new ProgressReporter()).run({ setExitCode: false }),
  );
  ok("sequential progress has no lane tag", out.includes("Alpha › a1") && !out.includes("[p"));
}

realLog(`\nall checks passed (${checks})`);
