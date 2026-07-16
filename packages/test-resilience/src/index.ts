// @youneed/test-resilience — timeout & retry as @youneed/test plugins.
//
// They're plain `runTest` middleware, which makes their power obvious: register
// both and they COMPOSE — retry (outer) re-runs, and each attempt is guarded by
// timeout (inner):
//
//   TestApplication().addTests(Flaky)
//     .use(retry(2))      // ① outermost — re-runs on failure
//     .use(timeout(5000)) // ② innermost — each attempt times out
//     .run();
//
// Per-case overrides via `@Timeout(ms)` / `@Retry(n)`. A retry stashes the count
// on `ctx.metadata.retries` and emits a live `onRetry` event for reporters.
//
// Note: middleware wraps the test BODY, so retries re-run the body (hooks run
// once around it) — keep bodies idempotent, or do setup inside the body.

import type { TestExecution, TestPlugin } from "@youneed/test";

// ── per-case config (set by decorators, read by plugins via exec.suite/key) ───
const timeouts = new WeakMap<Function, Map<string, number>>();
const retries = new WeakMap<Function, Map<string, number>>();
function put(reg: WeakMap<Function, Map<string, number>>, ctor: Function, key: string, value: number) {
  let m = reg.get(ctor);
  if (!m) reg.set(ctor, (m = new Map()));
  m.set(key, value);
}

/** Thrown by the `timeout` plugin when a test exceeds its budget. */
export class TimeoutError extends Error {
  override name = "TimeoutError";
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
  }
}

/** Per-test timeout override (ms). Needs the `timeout()` plugin registered. */
export function Timeout(ms: number) {
  return (_v: unknown, ctx: ClassMethodDecoratorContext) => {
    ctx.addInitializer(function (this: unknown) {
      put(timeouts, (this as { constructor: Function }).constructor, String(ctx.name), ms);
    });
  };
}

/** Per-test retry override (extra attempts). Needs the `retry()` plugin. */
export function Retry(times: number) {
  return (_v: unknown, ctx: ClassMethodDecoratorContext) => {
    ctx.addInitializer(function (this: unknown) {
      put(retries, (this as { constructor: Function }).constructor, String(ctx.name), times);
    });
  };
}

/** Fail a test that runs longer than `defaultMs` (default 5000). `@Timeout(ms)`
 *  overrides per case; `0`/`Infinity` disables. Races the body against a timer —
 *  the abandoned body keeps running (use an abortable body for true cancel). */
export function timeout(defaultMs = 5000): TestPlugin {
  return {
    name: "timeout",
    async runTest(exec: TestExecution) {
      const ms = timeouts.get(exec.suite)?.get(exec.key) ?? defaultMs;
      if (!(ms > 0) || ms === Infinity) return exec.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const guard = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
        timer.unref?.();
      });
      try {
        await Promise.race([exec.next(), guard]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Re-run a failing test up to `times` extra attempts (default 2). `@Retry(n)`
 *  overrides per case. Records the retry count on `ctx.metadata.retries` and
 *  emits a live `onRetry` event each attempt. */
export function retry(times = 2): TestPlugin {
  return {
    name: "retry",
    async runTest(exec: TestExecution) {
      const max = retries.get(exec.suite)?.get(exec.key) ?? times;
      let lastError: unknown;
      for (let attempt = 0; attempt <= max; attempt++) {
        try {
          await exec.next();
          if (attempt > 0) exec.ctx.metadata.retries = attempt;
          return;
        } catch (error) {
          lastError = error;
          if (attempt < max) {
            await exec.emit("onRetry", {
              suite: exec.ctx.suite,
              name: exec.ctx.name,
              attempt: attempt + 1,
              of: max,
              error: (error as Error)?.message ?? String(error),
            });
          }
        }
      }
      exec.ctx.metadata.retries = max;
      throw lastError; // exhausted → the test fails
    },
  };
}
