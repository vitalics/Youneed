# @youneed/test-resilience

Timeout & retry for [`@youneed/test`](../test) — as plain `runTest` plugins, so
they **compose**: register both and `retry` (outer) re-runs while `timeout`
(inner) guards each attempt.

```bash
pnpm add -D @youneed/test @youneed/test-resilience
```

```ts
import { TestApplication } from "@youneed/test";
import { timeout, retry, Timeout, Retry } from "@youneed/test-resilience";

class Flaky extends Test() {
  @Retry(3) @Timeout(2000) @Test.it("eventually") work() { /* … */ }
}

TestApplication().addTests(Flaky)
  .use(retry(2))      // outer — re-runs on failure
  .use(timeout(5000)) // inner — each attempt times out
  .run();
```

- `timeout(defaultMs=5000)` — fails with `TimeoutError` if a test runs too long
  (`@Timeout(ms)` per case; `0`/`Infinity` disables). Races the body; an
  abortable body cancels for real.
- `retry(times=2)` — re-runs a failing test (`@Retry(n)` per case). Records
  `ctx.metadata.retries` and emits a live `onRetry` event.

> Middleware wraps the test BODY — retries re-run the body (hooks run once around
> it). Keep bodies idempotent, or put setup inside the body.
