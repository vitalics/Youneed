// @youneed/test-reporter-console — a colored, verbose console reporter for
// @youneed/test. Independent, pluggable: register it explicitly with
//   TestApplication().addTests(MyTest).reporter(new ConsoleReporter()).run();
// It subscribes to the framework's lifecycle events (the same `@Reporter.event`
// mechanism any reporter uses), so it needs only @youneed/test's public API.

import { Reporter, type RunSummary, type StepResult, type SuiteInfo, type TestResult } from "@youneed/test";

const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", bold: "\x1b[1m", reset: "\x1b[0m" };

/** Colored, per-test/suite console reporter (+ annotations + summary). For
 *  benchmark output, add `BenchmarkReporter` from `@youneed/test-plugin-benchmark`. */
export class ConsoleReporter extends Reporter({ name: "console" }) {
  @Reporter.event("onRunStart")
  start() {
    console.log(`\n${C.bold}@youneed/test${C.reset}\n`);
  }

  @Reporter.event("onSuiteStart")
  suite(info: SuiteInfo) {
    console.log(`${C.bold}${info.suite}${C.reset}`);
  }

  @Reporter.event("onTestEnd")
  test(r: TestResult) {
    if (r.status === "passed") console.log(`  ${C.green}✓${C.reset} ${r.name} ${C.dim}(${r.durationMs.toFixed(1)}ms)${C.reset}`);
    else if (r.status === "skipped") console.log(`  ${C.yellow}∘${C.reset} ${C.dim}${r.name} (skipped)${C.reset}`);
    else {
      console.log(`  ${C.red}✗ ${r.name}${C.reset}`);
      console.log(`    ${C.red}${r.error?.message ?? "failed"}${C.reset}`);
    }
    // Named steps (ctx.step / Test.step), indented + nested.
    this.#steps(r.steps ?? [], 2);
    // Annotations collected on the TestContext during the run (ctx.annotate).
    for (const a of r.annotations ?? []) {
      console.log(`    ${C.dim}# ${a.type}${a.description ? `: ${a.description}` : ""}${C.reset}`);
    }
  }

  #steps(steps: StepResult[], depth: number) {
    for (const s of steps) {
      const pad = " ".repeat(depth);
      const mark = s.error ? `${C.red}✗` : `${C.dim}↳`;
      console.log(`${pad}${mark}${C.reset} ${C.dim}${s.name} (${s.durationMs.toFixed(1)}ms)${C.reset}`);
      this.#steps(s.steps, depth + 2);
    }
  }

  @Reporter.event("onRunEnd")
  end(s: RunSummary) {
    const parts = [`${C.green}${s.passed} passed${C.reset}`];
    if (s.failed) parts.push(`${C.red}${s.failed} failed${C.reset}`);
    if (s.skipped) parts.push(`${C.yellow}${s.skipped} skipped${C.reset}`);
    console.log(`\n${parts.join(", ")} ${C.dim}(${s.total} total, ${s.durationMs.toFixed(0)}ms)${C.reset}\n`);
  }
}
