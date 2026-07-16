// @youneed/test-reporter-junit — writes a JUnit XML report (the de-facto CI
// format consumed by Jenkins/GitLab/GitHub/etc.).
//
//   TestApplication().addTests(...).reporter(new JUnitReporter({ output: "junit.xml" })).run();

import { writeFileSync } from "node:fs";
import { Reporter, type RunSummary, type TestResult } from "@youneed/test";

export interface JUnitOptions {
  /** File to write the XML to. Omit to only build it via `render()`. */
  output?: string;
  /** `<testsuites name>` (default "youneed"). */
  name?: string;
}

const esc = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const sec = (ms: number) => (ms / 1000).toFixed(3);

/** Collects results and writes JUnit XML on run end (grouped by suite). */
export class JUnitReporter extends Reporter({ name: "junit" }) {
  #rows: TestResult[] = [];
  #summary?: RunSummary;
  constructor(private opts: JUnitOptions = {}) {
    super();
  }

  @Reporter.event("onTestEnd")
  collect(r: TestResult) {
    this.#rows.push(r);
  }

  @Reporter.event("onRunEnd")
  write(summary: RunSummary) {
    this.#summary = summary;
    const xml = this.render();
    if (this.opts.output) {
      writeFileSync(this.opts.output, xml);
      console.log(`junit report → ${this.opts.output}`);
    }
  }

  /** Render the collected results to a JUnit XML string. */
  render(): string {
    const s = this.#summary;
    const bySuite = new Map<string, TestResult[]>();
    for (const r of this.#rows) {
      const list = bySuite.get(r.suite) ?? [];
      list.push(r);
      bySuite.set(r.suite, list);
    }

    const suites = [...bySuite.entries()].map(([suite, rows]) => {
      const failures = rows.filter((r) => r.status === "failed").length;
      const skipped = rows.filter((r) => r.status === "skipped").length;
      const time = rows.reduce((t, r) => t + r.durationMs, 0);
      const cases = rows
        .map((r) => {
          const open = `    <testcase name="${esc(r.name)}" classname="${esc(suite)}" time="${sec(r.durationMs)}"`;
          if (r.status === "failed") {
            return `${open}>\n      <failure message="${esc(r.error?.message ?? "failed")}">${esc(r.error?.stack ?? "")}</failure>\n    </testcase>`;
          }
          if (r.status === "skipped") return `${open}>\n      <skipped/>\n    </testcase>`;
          return `${open}/>`;
        })
        .join("\n");
      return `  <testsuite name="${esc(suite)}" tests="${rows.length}" failures="${failures}" skipped="${skipped}" time="${sec(time)}">\n${cases}\n  </testsuite>`;
    });

    const attrs = `name="${esc(this.opts.name ?? "youneed")}" tests="${s?.total ?? this.#rows.length}" failures="${s?.failed ?? 0}" skipped="${s?.skipped ?? 0}" time="${sec(s?.durationMs ?? 0)}"`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites ${attrs}>\n${suites.join("\n")}\n</testsuites>\n`;
  }
}

export default JUnitReporter;
