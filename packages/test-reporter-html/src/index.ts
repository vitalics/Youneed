// @youneed/test-reporter-html — writes a standalone HTML report for a
// @youneed/test run. Independent and pluggable: register it like any reporter.
//
//   import { HTMLReporter } from "@youneed/test-reporter-html";
//   TestApplication().addTests(MyTest).reporter(new HTMLReporter({ output: "report.html" })).run();

import { writeFileSync } from "node:fs";
import { Reporter, type RunSummary, type TestResult } from "@youneed/test";

export interface HTMLReporterOptions {
  /** File path to write the report to. If omitted, nothing is written and you
   *  can call `render()` yourself to get the HTML string. */
  output?: string;
  /** Document title (default "Test report"). */
  title?: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Collects results over the run and writes an HTML report on `onRunEnd`. */
export class HTMLReporter extends Reporter({ name: "html" }) {
  #rows: TestResult[] = [];
  #summary?: RunSummary;
  constructor(private opts: HTMLReporterOptions = {}) {
    super();
  }

  // Lower priority → runs before other onTestEnd handlers (cosmetic; harmless).
  @Reporter.event("onTestEnd", { priority: 1 })
  collect(result: TestResult) {
    this.#rows.push(result);
  }

  @Reporter.event("onRunEnd")
  write(summary: RunSummary) {
    this.#summary = summary;
    if (this.opts.output) {
      writeFileSync(this.opts.output, this.render());
      console.log(`html report → ${this.opts.output}`);
    }
  }

  /** Render the collected results to an HTML document string. */
  render(): string {
    const title = esc(this.opts.title ?? "Test report");
    const s = this.#summary;
    const summary = s
      ? `<p class="summary">${s.passed} passed · ${s.failed} failed · ${s.skipped} skipped ` +
        `<span class="dim">(${s.total} total, ${s.durationMs.toFixed(0)}ms)</span></p>`
      : "";
    const rows = this.#rows
      .map((r) => {
        // Benchmark stats (if the @youneed/test-plugin-benchmark plugin ran) live under metadata.
        const bench = r.metadata?.benchmark as { hz: number; mean: number; samples: number } | undefined;
        const b = bench
          ? `<span class="bench">⚡ ${Math.round(bench.hz).toLocaleString("en-US")} ops/sec · mean ${bench.mean.toFixed(4)}ms · ${bench.samples} samples</span>`
          : "";
        const err = r.error ? `<div class="err">${esc(r.error.message)}</div>` : "";
        return (
          `<li class="${r.status}"><span class="badge">${r.status}</span> ` +
          `<span class="suite">${esc(r.suite)}</span> › <span class="name">${esc(r.name)}</span> ` +
          `<span class="dim">${r.durationMs.toFixed(1)}ms</span>${b}${err}</li>`
        );
      })
      .join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>
      body { font: 14px/1.6 system-ui, sans-serif; margin: 32px; color: #1b1b1f; }
      h1 { font-size: 20px; }
      .summary { font-weight: 600; }
      .dim { color: #71717a; font-weight: 400; }
      ul { list-style: none; padding: 0; }
      li { padding: 6px 10px; border-radius: 8px; margin: 3px 0; background: #f4f4f5; }
      .badge { display: inline-block; min-width: 58px; text-align: center; border-radius: 6px; font-size: 11px; text-transform: uppercase; padding: 1px 6px; color: #fff; }
      li.passed .badge { background: #16a34a; }
      li.failed .badge { background: #dc2626; }
      li.skipped .badge { background: #a1a1aa; }
      .bench { color: #b45309; margin-left: 8px; }
      .err { color: #b91c1c; font-family: ui-monospace, Menlo, monospace; margin: 4px 0 0 66px; white-space: pre-wrap; }
    </style></head><body><h1>${title}</h1>${summary}<ul>${rows}</ul></body></html>`;
  }
}
