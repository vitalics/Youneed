# @youneed/test-reporter-progress

A live, **interactive** progress reporter for [`@youneed/test`](../test). It
listens to the core's `onProgress` event — emitted as each test starts and ends,
**live even during a `.parallel()` run** — and shows what's running where.

## Install

```bash
pnpm add -D @youneed/test @youneed/test-reporter-progress
```

## Use

```ts
import { TestApplication } from "@youneed/test";
import { ProgressReporter } from "@youneed/test-reporter-progress";

await TestApplication()
  .addTests(...suites)
  .parallel(4)                       // run across 4 in-process lanes
  .reporter(new ProgressReporter())  // live per-lane status
  .run();
```

On a TTY with more than one lane it redraws a per-lane dashboard in place:

```
  lane 1/4  ✓ Auth › logs in
  lane 2/4  ▶ Cart › adds item        ← currently running
  lane 3/4  ✓ Search › finds product
  lane 4/4  ▶ Checkout › pays
```

Off a TTY (CI, piped) or single-lane, it prints one tagged line per event
(`[p2/4] ▶ Cart › adds item`), so it's log-friendly. Compose it with an ordered
reporter (e.g. `ConsoleReporter`) for the final summary.

## How it works

The core stamps every test with a `RunContext` (`{ mode, lane, lanes, shard }`)
and emits a live `ProgressEvent` on `onProgress`. In a parallel run the canonical
`onTest*` events are buffered and replayed in order at the end (clean output),
while `onProgress` is delivered to reporters in real time — that split is what
makes a live dashboard possible without interleaving the final report.
