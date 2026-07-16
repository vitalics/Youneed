// @youneed/test-plugin-benchmark — benchmarking as a pluggable @youneed/test extension.
//
//   import { TestApplication, Test } from "@youneed/test";
//   import { Benchmark, benchmark, BenchmarkReporter } from "@youneed/test-plugin-benchmark";
//
//   class Perf extends Test() {
//     @Benchmark({ name: "sum 1k", iterations: 2000 })
//     @Test.it()
//     sum() { data.reduce((a, b) => a + b, 0); }
//   }
//
//   TestApplication().addTests(Perf)
//     .use(benchmark())                 // the plugin: turns marked cases into timed loops
//     .reporter(new BenchmarkReporter()) // its output (⚡ ops/sec); compose with others
//     .run();
//
// The plugin wraps each marked case via TestPlugin.runTest: it loops the body
// (warmup + measured iterations), times each with performance.mark/measure +
// PerformanceObserver, and stashes the stats on `ctx.metadata.benchmark` — so they
// ride on the TestResult and survive the blob reporter / parallel merge.

import {
  Reporter,
  registerTestCase,
  type TestContext,
  type TestExecution,
  type TestPlugin,
  type TestResult,
} from "@youneed/test";

// ── public types ──────────────────────────────────────────────────────────────
export interface BenchOptions {
  /** Display name for the benchmark (defaults to the test name). */
  name?: string;
  /** Fixed number of measured iterations. Overrides the time budget — use it for
   *  reproducible, comparable runs (`benchmark({ iterations })` sets a default
   *  for every case; `@Benchmark({ iterations })` overrides it per case). */
  iterations?: number;
  /** Warmup iterations run (untimed) before measuring (default `5`). */
  warmup?: number;
  /** Operations per measured sample (default `1`). For sub-microsecond ops, raise
   *  it (e.g. `1000`) so each sample amortizes the timing overhead — otherwise
   *  `performance.measure` jitter dominates and numbers are noisy. The reported
   *  per-op duration is the sample time divided by `batch`. */
  batch?: number;
  /** When `iterations` is unset, keep sampling until this many ms elapse
   *  (default `500`), bounded by `maxSamples`. */
  timeBudgetMs?: number;
  /** Hard cap on measured samples for the time-budget mode (default `10_000`). */
  maxSamples?: number;
  /** Comparison group: benchmarks sharing a `group` are tabulated together by the
   *  reporter (so e.g. "mount" and "update" form separate tables). */
  group?: string;
  /** Mark this benchmark as the table's reference row — others are reported as
   *  "N× faster/slower" relative to it. Without a baseline the fastest is used. */
  baseline?: boolean;
}

/** Timing stats for one benchmark (all durations in milliseconds). */
export interface BenchStats {
  name: string;
  samples: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p75: number;
  p99: number;
  stddev: number;
  hz: number;
  totalMs: number;
  /** Comparison group (from `BenchOptions.group`) — for the reporter's tables. */
  group?: string;
  /** Whether this was the table's baseline row (from `BenchOptions.baseline`). */
  baseline?: boolean;
}

/** The {@link TestContext} a benchmark case sees — with mutable `options` (tweak
 *  them in an `onBenchmarkStart` reporter handler before measuring). */
export interface BenchmarkContext extends TestContext {
  options: BenchOptions;
}

// ── decorator ──────────────────────────────────────────────────────────────────
// Per-suite registry of benchmarked method keys → options. Keyed by the suite
// constructor so the plugin can look it up at run time via `exec.suite`.
const registry = new WeakMap<Function, Map<string, BenchOptions>>();

/**
 * Mark a method as a benchmark. Stack with `@Test.it()` (any order) or use alone
 * (it registers a runnable case via `registerTestCase`). Needs the `benchmark()`
 * plugin registered with `.use(...)` to take effect.
 */
export function Benchmark(opts: BenchOptions = {}) {
  return function (_value: unknown, ctx: ClassMethodDecoratorContext) {
    ctx.addInitializer(function (this: unknown) {
      const ctor = (this as { constructor: Function }).constructor;
      let map = registry.get(ctor);
      if (!map) registry.set(ctor, (map = new Map()));
      const key = String(ctx.name);
      map.set(key, opts);
      // Ensure a runnable case exists (for stand-alone `@Benchmark`), but DON'T
      // override the test name — `opts.name` is the benchmark's display name only
      // (used in BenchStats). With `@Test.it("…")` present, that name wins.
      registerTestCase(ctor, key);
    });
  };
}

// ── plugin ───────────────────────────────────────────────────────────────────
const MEASURE = "youneed.bench";

/**
 * The benchmark plugin. Register with `TestApplication().use(benchmark())`.
 * `defaults` apply to every benchmark in the run; a per-case `@Benchmark({…})`
 * option overrides the matching default — e.g. `benchmark({ iterations: 2000 })`
 * fixes the iteration count run-wide for reproducible, comparable numbers.
 */
export function benchmark(defaults: BenchOptions = {}): TestPlugin {
  return {
    name: "benchmark",
    async runTest(exec: TestExecution) {
      const own = registry.get(exec.suite)?.get(exec.key);
      if (!own) return exec.next(); // not a benchmark — run the body once
      const opts: BenchOptions = { ...defaults, ...own }; // per-case wins

      const ctx = exec.ctx as BenchmarkContext;
      ctx.options = opts;
      await exec.emit("onBenchmarkStart", ctx); // live progress (may tweak ctx.options)

      ctx.metadata.benchmark = await runBenchmark(() => exec.next(), {
        ...ctx.options,
        name: ctx.options.name ?? exec.key,
      }); // → TestResult.metadata.benchmark (blob-safe)
    },
  };
}

let measureSeq = 0;

/**
 * Imperatively benchmark a function — the same engine the plugin uses, without a
 * test/decorator. Handy where TC39 decorators can't be used (e.g. an Angular
 * bench compiled with legacy `experimentalDecorators`), or for ad-hoc loops:
 *
 *   const results = [
 *     await runBenchmark(() => vanilla(), { name: "vanilla", group: "g", baseline: true }),
 *     await runBenchmark(() => ours(),    { name: "ours",    group: "g" }),
 *   ];
 *   printBenchmarkTables(results);
 *
 * Loops the fn (warmup + measured), timing each iteration with
 * performance.mark/measure collected via a PerformanceObserver.
 */
export async function runBenchmark(fn: () => unknown | Promise<unknown>, opts: BenchOptions = {}): Promise<BenchStats> {
  const warmup = opts.warmup ?? 5;
  const budget = opts.timeBudgetMs ?? 500;
  const maxSamples = opts.maxSamples ?? 10_000;
  const minSamples = 10;
  const batch = Math.max(1, opts.batch ?? 1);
  const fixed = opts.iterations;
  const measureName = `${MEASURE}:${++measureSeq}`;

  for (let i = 0; i < warmup; i++) await fn(); // untimed warmup

  const samples: number[] = [];
  const collect = (entries: PerformanceEntry[]) => {
    // record the PER-OP duration (sample time ÷ batch)
    for (const e of entries) if (e.name === measureName) samples.push(e.duration / batch);
  };
  const observer = new PerformanceObserver((list) => collect(list.getEntries()));
  observer.observe({ entryTypes: ["measure"] });

  const start = performance.now();
  let i = 0;
  for (;;) {
    const mark = `${measureName}:${i}`;
    performance.mark(mark);
    for (let b = 0; b < batch; b++) await fn();
    performance.measure(measureName, mark);
    performance.clearMarks(mark);
    i++;
    if (fixed != null) {
      if (i >= fixed) break;
    } else if (i >= maxSamples || (performance.now() - start >= budget && i >= minSamples)) {
      break;
    }
  }
  collect(observer.takeRecords());
  observer.disconnect();
  performance.clearMeasures(measureName);

  const stats = computeStats(opts.name ?? "benchmark", samples, performance.now() - start);
  stats.group = opts.group;
  stats.baseline = opts.baseline;
  return stats;
}

function computeStats(name: string, raw: number[], totalMs: number): BenchStats {
  const s = [...raw].sort((a, b) => a - b);
  const n = s.length;
  const mean = n ? s.reduce((a, b) => a + b, 0) / n : 0;
  const pct = (p: number) => (n ? s[Math.min(n - 1, Math.floor((p / 100) * n))] : 0);
  const variance = n ? s.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
  return {
    name,
    samples: n,
    mean,
    min: n ? s[0] : 0,
    max: n ? s[n - 1] : 0,
    p50: pct(50),
    p75: pct(75),
    p99: pct(99),
    stddev: Math.sqrt(variance),
    hz: mean > 0 ? 1000 / mean : 0,
    totalMs,
  };
}

// ── reporter ───────────────────────────────────────────────────────────────────
const C = { dim: "\x1b[2m", yellow: "\x1b[33m", green: "\x1b[32m", bold: "\x1b[1m", reset: "\x1b[0m" };
const fmtHz = (hz: number) => (hz >= 1 ? Math.round(hz).toLocaleString("en-US") : hz.toFixed(2));

/** Print a comparison table per `group` (fastest first; each row "N× faster/
 *  slower" vs the group's `baseline`, or its fastest if none is marked). Shared
 *  by {@link BenchmarkReporter} and usable directly with {@link runBenchmark}. */
export function printBenchmarkTables(results: BenchStats[]): void {
  const groups = new Map<string, BenchStats[]>();
  for (const b of results) {
    const key = b.group ?? "";
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(b);
  }
  for (const [group, items] of groups) {
    if (items.length < 2) continue;
    const ref = items.find((b) => b.baseline) ?? items.reduce((a, b) => (b.hz > a.hz ? b : a));
    const sorted = [...items].sort((a, b) => b.hz - a.hz);
    const w = Math.max(...sorted.map((b) => b.name.length));
    console.log(`\n  ${C.bold}${group || "benchmark"}${C.reset}`);
    for (const b of sorted) {
      const hz = `${fmtHz(b.hz)} ops/sec`.padStart(18);
      let rel: string;
      if (b === ref) {
        rel = ref.baseline ? `${C.dim}baseline${C.reset}` : `${C.yellow}▲ fastest${C.reset}`;
      } else if (ref.hz > 0 && b.hz > 0) {
        const ratio = b.hz / ref.hz;
        rel =
          ratio >= 1
            ? `${C.green}${ratio.toFixed(2)}× faster${C.reset}`
            : `${C.dim}${(1 / ratio).toFixed(2)}× slower${C.reset}`;
      } else {
        rel = "—";
      }
      console.log(`    ${b.name.padEnd(w)}  ${hz}   ${rel}`);
    }
  }
}

/** Renders benchmark results (`⚡ … ops/sec`) live as each finishes, then — when
 *  benchmarks share a `group` (or there's more than one) — a comparison TABLE per
 *  group on `onRunEnd`, each row "N× faster/slower" vs the group's `baseline`
 *  (or its fastest). Stats are read from `TestResult.metadata.benchmark`, so it
 *  works for live, parallel and merged (blob) runs alike. */
export class BenchmarkReporter extends Reporter({ name: "benchmark" }) {
  #results: BenchStats[] = [];

  @Reporter.event("onRunStart")
  runStart() {
    this.#results = [];
  }

  @Reporter.event("onBenchmarkStart")
  start(ctx: BenchmarkContext) {
    console.log(`  ${C.dim}⏱  ${ctx.name} — benchmarking…${C.reset}`);
  }

  @Reporter.event("onTestEnd")
  end(r: TestResult) {
    const b = r.metadata?.benchmark as BenchStats | undefined;
    if (!b) return;
    this.#results.push(b);
    const rsd = b.mean > 0 ? ((b.stddev / b.mean) * 100).toFixed(1) : "0.0";
    console.log(
      `  ${C.yellow}⚡${C.reset} ${b.name} ${C.bold}${fmtHz(b.hz)} ops/sec${C.reset} ` +
        `${C.dim}±${rsd}%  (mean ${b.mean.toFixed(4)}ms · p99 ${b.p99.toFixed(4)}ms · ${b.samples} samples)${C.reset}`,
    );
  }

  @Reporter.event("onRunEnd")
  runEnd() {
    printBenchmarkTables(this.#results);
  }
}
