---
name: youneed-test
description: "Writing and running tests with @youneed/test — the class + TC39-decorator test framework (suites extend Test(), @Test.it cases, Fixture() scoped setup/teardown, expect matchers, fn/spyOn mocks). Covers data-driven @Test.each, TestContext (steps, annotations, attachments, ctx.signal abort + timeouts), parallel/worker/shard runs + blob merge, the reporter ecosystem (@youneed/test-reporter-*), plugins (benchmark/resilience/snapshot), the live devtools UI server (@youneed/test-devtools), running a webServer as a precondition (à la Playwright), and the CLI. Use this skill when writing a test suite/fixture, choosing matchers, debugging flaky/async tests, setting timeouts or cancellation, parallelizing or sharding a run, picking a reporter, or wiring an E2E web server."
license: ISC
---

# youneed — Writing & Running Tests

`@youneed/test` is a test framework in the same paradigm as `@youneed/dom`
(`Component`) and `@youneed/server` (`Application`): a factory returns a base class
you extend, **TC39 (Stage 3) decorators** register members via `addInitializer`, and
a fluent builder (`TestApplication`) wires it up and runs it. No globals, no magic —
suites are just classes you can import and run.

Source of truth: `packages/test/src/{index,cli,mock}.ts`, `packages/test/README.md`,
and the ecosystem packages `packages/test-*`. Verify a signature there before
asserting it.

| Task | Read |
|------|------|
| Write suites, fixtures, hooks, data-driven cases, assertions, mocks, `TestContext`, **`ctx.signal`/timeouts** | `references/authoring.md` |
| Run tests: CLI, `.parallel`/`.workers`/`.shard` + blob merge, reporters, plugins, **`webServer` precondition**, **devtools UI server** | `references/running.md` |

## At a glance

```ts
import { Test, Fixture, TestApplication, expect } from "@youneed/test";

class CalcFixture extends Fixture<Calc>({ name: "calc", scope: "test" }) {
  setup() { return new Calc(); }
}

class CalcTest extends Test({ name: "Calculator" }) {
  @Test.use(CalcFixture) calc!: Calc;                 // fixture injection (decorator)

  @Test.beforeEach() reset() { this.calc.clear(); }
  @Test.it("adds") add() { expect(this.calc.add(2, 3)).toBe(5); }

  @Test.it("fetches", { timeout: 2000 })              // ms; fail + abort ctx.signal if exceeded
  async fetches(ctx) { await fetch(url, { signal: ctx.signal }); }
}

await TestApplication().addTests(CalcTest).run();     // → RunSummary
```

- **One instance per suite.** Use `@Test.beforeEach()` to reset per-test state, or a
  `"test"`-scoped fixture for fresh values each case.
- **Decorators go on real members**, never `declare` fields (metadata is collected at
  construction via `addInitializer` + a registry — same as the rest of youneed; works
  under esbuild/tsx where `Symbol.metadata` is not emitted).
- **`TestApplication().run()` resolves to a `RunSummary`** (`{ total, passed, failed,
  skipped, durationMs, results }`) and sets `process.exitCode = 1` on failure unless
  `run({ setExitCode: false })`.
- **Async cancellation is first-class:** every `TestContext` carries `ctx.signal`
  (an `AbortSignal` aborted on timeout / when the test ends) — thread it into
  `fetch`, event listeners and long loops so they're torn down with the test.

## Answering style

- Give a runnable class + the exact decorator/builder call. Prefer fixtures over
  ad-hoc `beforeEach` mutation when a value can be scoped.
- For matchers, name the exact matcher (`toEqual` deep-compares, `toBe` is `Object.is`)
  and point richer ones to `@youneed/test-expect-extra`.
- For anything async/flaky, reach for `ctx.signal` + a `timeout` first; for retries
  use the `@youneed/test-resilience` plugins.
- For reporters/parallelism/CLI, route to `references/running.md` and name the
  concrete package (`@youneed/test-reporter-<name>`) — install only what's needed.
