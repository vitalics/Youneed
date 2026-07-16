// @youneed/test-reporter-tap — emits TAP version 13 (the format node:test speaks),
// so any TAP consumer (CI, `tap-*` formatters) can read a @youneed/test run.
//
//   TestApplication().addTests(...).reporter(new TapReporter()).run();

import { Reporter, type RunSummary, type TestResult } from "@youneed/test";

export class TapReporter extends Reporter({ name: "tap" }) {
  #n = 0;

  @Reporter.event("onRunStart")
  start() {
    console.log("TAP version 13");
  }

  @Reporter.event("onTestEnd")
  test(r: TestResult) {
    const point = `${++this.#n} - ${r.suite} > ${r.name}`;
    if (r.status === "skipped") {
      console.log(`ok ${point} # SKIP`);
      return;
    }
    if (r.status === "passed") {
      console.log(`ok ${point}`);
      return;
    }
    // not ok + a YAML diagnostic block (TAP spec)
    console.log(`not ok ${point}`);
    console.log("  ---");
    console.log(`  message: ${JSON.stringify(r.error?.message ?? "failed")}`);
    console.log("  severity: fail");
    if (r.error?.stack) console.log(`  stack: ${JSON.stringify(r.error.stack)}`);
    console.log("  ...");
  }

  @Reporter.event("onRunEnd")
  end(s: RunSummary) {
    console.log(`1..${s.total}`);
    console.log(`# tests ${s.total}`);
    console.log(`# pass ${s.passed}`);
    if (s.failed) console.log(`# fail ${s.failed}`);
    if (s.skipped) console.log(`# skip ${s.skipped}`);
  }
}

export default TapReporter;
