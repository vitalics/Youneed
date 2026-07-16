# @youneed/test-reporter-html

Writes a standalone HTML report for a [`@youneed/test`](../test) run — every
suite/test with pass/fail/skip badges, failure messages, benchmark stats, and a
summary. An independent, pluggable reporter.

## Install

```bash
pnpm add -D @youneed/test @youneed/test-reporter-html
```

## Use

```ts
import { TestApplication } from "@youneed/test";
import { HTMLReporter } from "@youneed/test-reporter-html";

await TestApplication()
  .addTests(MyTest)
  .reporter(new HTMLReporter({ output: "report.html", title: "My suite" }))
  .run();
```

Options: `output` (file path; omit to render in-memory only) and `title`. Without
an `output`, call `reporter.render()` to get the HTML string yourself.

Compose it with the console reporter (and a blob for sharded runs):

```ts
TestApplication()
  .addTests(...suites)
  .reporter(new ConsoleReporter())             // @youneed/test-reporter-console
  .reporter(new HTMLReporter({ output: "report.html" }))
  .run();
```
