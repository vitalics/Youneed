// Self-test for the benchmark extension.
import assert from "node:assert/strict";
import { Reporter, Test, TestApplication, expect, type TestContext, type TestResult } from "@youneed/test";
import { Benchmark, benchmark, BenchmarkReporter, type BenchmarkContext } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};
const silent = () => new (class extends Reporter({ name: "silent" }) {})();

// ── plugin turns a marked case into a timed loop; stats land on metadata ──────
{
  let runs = 0;
  const starts: BenchmarkContext[] = [];
  class Cap extends Reporter({ name: "cap" }) {
    @Reporter.event("onBenchmarkStart") s(ctx: BenchmarkContext) {
      starts.push(ctx);
    }
  }
  class S extends Test() {
    @Benchmark({ name: "tiny", iterations: 40 })
    @Test.it()
    loop() {
      runs++;
    }
    @Test.it("a plain test")
    plain() {
      expect(1 + 1).toBe(2);
    }
  }
  const s = await TestApplication().addTests(S).use(benchmark()).reporter(silent()).reporter(new Cap()).run({ setExitCode: false });
  const r = s.results.find((x) => x.name === "loop")!;
  const stats = r.metadata?.benchmark as { samples: number; hz: number; name: string } | undefined;

  ok("benchmark + plain test both pass", s.passed === 2 && s.failed === 0);
  ok("plugin looped the body (warmup + 40 measured)", runs >= 40);
  ok("stats land on TestResult.metadata.benchmark", !!stats && stats.samples === 40 && stats.hz > 0);
  ok("custom benchmark name applied", stats!.name === "tiny");
  ok("onBenchmarkStart fired with a BenchmarkContext (options exposed)", starts.length === 1 && starts[0].options.iterations === 40);
}

// ── WITHOUT the plugin: the marker is inert, the body runs once as a normal test ─
{
  let runs = 0;
  class S extends Test() {
    @Benchmark({ iterations: 99 })
    @Test.it()
    loop() {
      runs++;
    }
  }
  const s = await TestApplication().addTests(S).reporter(silent()).run({ setExitCode: false });
  ok("without .use(benchmark()) the body runs once (plugin opt-in)", runs === 1 && s.passed === 1);
}

// ── reporter renders ⚡ from metadata (works even on a replayed result) ─────────
{
  const lines: string[] = [];
  const realLog = console.log.bind(console);
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  const reporter = new BenchmarkReporter();
  // Simulate the events a run would emit.
  (reporter as unknown as { start(c: TestContext): void }).start({ name: "tiny" } as TestContext);
  (reporter as unknown as { end(r: TestResult): void }).end({
    suite: "S",
    name: "loop",
    status: "passed",
    durationMs: 1,
    metadata: { attachments: [], benchmark: { name: "tiny", samples: 40, mean: 0.01, min: 0, max: 0, p50: 0, p75: 0, p99: 0.02, stddev: 0, hz: 100000, totalMs: 1 } },
  });
  console.log = realLog;
  const out = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
  ok("reporter prints progress on start", out.includes("benchmarking"));
  ok("reporter prints ⚡ ops/sec from metadata", out.includes("⚡ tiny") && out.includes("ops/sec"));
}

// ── plugin-level default iterations; per-case @Benchmark overrides it ──────────
{
  class S extends Test() {
    @Benchmark({ name: "uses-default" }) a() {}
    @Benchmark({ name: "overrides", iterations: 12 }) b() {}
  }
  const s = await TestApplication().addTests(S).use(benchmark({ iterations: 30 })).reporter(silent()).run({ setExitCode: false });
  const stat = (n: string) => s.results.find((r) => r.metadata?.benchmark && (r.metadata.benchmark as { name: string }).name === n)!.metadata!.benchmark as { samples: number };
  ok("benchmark({ iterations }) sets a run-wide default", stat("uses-default").samples === 30);
  ok("@Benchmark({ iterations }) overrides the default", stat("overrides").samples === 12);
}

// ── baseline + group land on the stats, and the reporter renders a table ───────
{
  class S extends Test() {
    @Benchmark({ name: "ours", group: "render", baseline: true, iterations: 10 }) ours() {}
    @Benchmark({ name: "them", group: "render", iterations: 10 }) them() {}
  }
  const s = await TestApplication().addTests(S).use(benchmark()).reporter(silent()).run({ setExitCode: false });
  const ours = s.results.find((r) => (r.metadata?.benchmark as { name: string })?.name === "ours")!.metadata!.benchmark as { group?: string; baseline?: boolean };
  ok("group + baseline ride on TestResult.metadata.benchmark", ours.group === "render" && ours.baseline === true);

  // Render the table from two results in the same group with a baseline.
  const lines: string[] = [];
  const realLog = console.log.bind(console);
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  const reporter = new BenchmarkReporter() as unknown as {
    runStart(): void;
    end(r: TestResult): void;
    runEnd(): void;
  };
  const mk = (name: string, hz: number, baseline?: boolean): TestResult => ({
    suite: "S", name, status: "passed", durationMs: 1,
    metadata: { attachments: [], benchmark: { name, samples: 10, mean: 1000 / hz, min: 0, max: 0, p50: 0, p75: 0, p99: 0, stddev: 0, hz, totalMs: 1, group: "render", baseline } },
  });
  reporter.runStart();
  reporter.end(mk("ours", 1000, true));
  reporter.end(mk("them", 500));
  reporter.runEnd();
  console.log = realLog;
  const out = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
  ok("table prints the group header", out.includes("render"));
  ok("baseline row is labelled", out.includes("ours") && out.includes("baseline"));
  ok("other row is relative to the baseline", out.includes("them") && out.includes("2.00× slower"));
}

console.log(`\nall checks passed (${checks})`);
