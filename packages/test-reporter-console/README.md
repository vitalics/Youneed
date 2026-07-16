# @youneed/test-reporter-console

A colored, verbose console reporter for [`@youneed/test`](../test) — prints a
header, every suite/test (`✓` / `✗` / `∘`), annotations, and a final summary.
It's an independent, pluggable package: install only the reporters you want.

> The core `@youneed/test` ships a quiet `DefaultReporter` (failures + summary).
> Use this package when you want the full, colored per-test output. For benchmark
> output, add `BenchmarkReporter` from `@youneed/test-benchmark`.

## Install

```bash
pnpm add -D @youneed/test @youneed/test-reporter-console
```

## Use

```ts
import { TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

await TestApplication()
  .addTests(MyTest)
  .reporter(new ConsoleReporter())   // plug it in
  .run();
```

Compose it with others (e.g. a blob for sharded runs, or an HTML report):

```ts
TestApplication()
  .addTests(...suites)
  .reporter(new ConsoleReporter())
  .reporter(new HTMLReporter({ output: "report.html" })) // @youneed/test-reporter-html
  .workers(4)
  .run();
```

## Events

It subscribes to `onRunStart`, `onSuiteStart`, `onTestEnd`, and `onRunEnd` via
`@Reporter.event` — the same public mechanism any reporter uses, so you can model
your own after it. (For benchmark output, add `BenchmarkReporter` from
[`@youneed/test-benchmark`](../test-benchmark).)
