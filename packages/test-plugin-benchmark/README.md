# @youneed/test-plugin-benchmark

Benchmarking for [`@youneed/test`](../test) as a **pluggable extension** — a
decorator, a plugin, and a reporter. The core test framework has zero benchmark
code; install this when you want it.

## Install

```bash
pnpm add -D @youneed/test @youneed/test-plugin-benchmark
```

## Use

```ts
import { TestApplication, Test } from "@youneed/test";
import { Benchmark, benchmark, BenchmarkReporter } from "@youneed/test-plugin-benchmark";

class Perf extends Test() {
  data = Array.from({ length: 1000 }, (_, i) => i);

  @Benchmark({ name: "sum 1k", iterations: 2000 })  // fixed count…
  @Test.it()
  reduceSum() { this.data.reduce((a, b) => a + b, 0); }

  @Benchmark({ timeBudgetMs: 200 })                 // …or sample for a time budget
  @Test.it()
  sort() { [...this.data].sort((a, b) => b - a); }
}

await TestApplication()
  .addTests(Perf)
  .use(benchmark())                  // ① the plugin — turns marked cases into timed loops
  .reporter(new BenchmarkReporter()) // ② its output (compose with ConsoleReporter etc.)
  .run();
//   ⚡ sum 1k  174,894 ops/sec ±2.1%  (mean 0.0057ms · p99 0.0134ms · 2000 samples)
```

- **`@Benchmark(opts)`** — marks a method. Stack with `@Test.it()` (any order) or
  use alone. `opts`: `name`, `iterations` (fixed), `warmup` (default `5`),
  `timeBudgetMs` (default `500`), `maxSamples` (default `10_000`), plus `group`
  and `baseline` for the comparison table (below).
- **`benchmark(defaults?)`** — the plugin (`.use(...)`). It wraps each marked case
  via the core `TestPlugin.runTest` middleware: warmup + measured iterations, each
  timed with `performance.mark`/`performance.measure` collected through a
  `PerformanceObserver`. `defaults` apply run-wide and are overridden per case —
  e.g. `benchmark({ iterations: 5000 })` fixes the count everywhere for
  reproducible, comparable numbers. Without the plugin the `@Benchmark` marker is
  inert and the case runs once as a normal test.
- **`BenchmarkReporter`** — prints `⏱ …benchmarking` on start, the `⚡ … ops/sec`
  line per benchmark, and — on `onRunEnd` — a **comparison table per `group`**,
  fastest first, each row `N× faster/slower` vs the group's `baseline` (or its
  fastest if none is marked).

## Comparison tables

```ts
class Render extends Test() {
  @Benchmark({ name: "@youneed/dom", group: "mount", baseline: true }) ours() { /* … */ }
  @Benchmark({ name: "lit",          group: "mount" })                 them() { /* … */ }
}
await TestApplication().addTests(Render).use(benchmark({ iterations: 5000 })).reporter(new BenchmarkReporter()).run();
//   mount
//     lit            45,948 ops/sec   1.43× faster
//     @youneed/dom   32,039 ops/sec   baseline
```

## How it integrates

Stats are stashed on `ctx.metadata.benchmark`, so they ride on the `TestResult`
and **survive the blob reporter and parallel/sharded merges** — the reporter reads
`result.metadata.benchmark` in `onTestEnd`, which is replayed everywhere. The
`onBenchmarkStart` event is a live-only progress signal.

`BenchOptions`, `BenchStats`, and `BenchmarkContext` types are exported for
authoring your own reporter or tooling.
