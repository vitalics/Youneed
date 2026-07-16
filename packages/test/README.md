# @youneed/test

A class + decorator test framework in the same paradigm as `@youneed/dom`
(`Component`) and `@youneed/server` (`Application`): a factory returns a base
class you extend, TC39 decorators register members, and a fluent builder
(`TestApplication`) wires it up and runs it.

```ts
import { Test, Fixture, TestApplication, expect } from "@youneed/test";

class Calculator {
  add(a: number, b: number) { return a + b; }
}

class CalcFixture extends Fixture<Calculator>({ name: "calc", scope: "test" }) {
  setup() { return new Calculator(); }
}

class CalcTest extends Test({ name: "Calculator" }) {
  @Test.use(CalcFixture) calc!: Calculator;

  @Test.it("adds two numbers")
  adds() {
    expect(this.calc.add(2, 3)).toBe(5);
  }
}

await TestApplication().addTests(CalcTest).run();
```

## Suites

Extend `Test(options?)` and decorate methods:

| Decorator | Purpose |
| --- | --- |
| `@Test.it(name?, { skip?, only?, input?, timeout? })` | a test case (alias `@Test.test`) |
| `@Test.each(table, name?)` | a data-driven table — one case per row |
| `@Test.only(name?)` / `@Test.skip(name?)` | focus / skip a case |
| `@Test.beforeEach()` / `@Test.afterEach()` | run around every case |
| `@Test.beforeAll()` / `@Test.afterAll()` | run once per suite |
| `@Test.use(Fixture)` | inject a fixture value into a field |

One instance is created per suite; use `beforeEach` to reset per-test state, or a
`"test"`-scoped fixture for fresh values. If any case is marked `@Test.only`, the
whole run is restricted to `only` cases.

### Conditional run

`skip` can be a predicate `(ctx) => boolean | string`, evaluated at run time —
so it can branch on the lane/shard (`ctx.run`), env, or run-level params seeded
via `.context()` (à la Playwright project params). Return a string for a reason.

```ts
class S extends Test() {
  @Test.it("firefox only", { skip: (ctx) => ctx.metadata.browser !== "firefox" })
  feature() { /* … */ }
}

TestApplication().addTests(S).context({ browser: process.env.BROWSER }).run();
```

`.context(seed)` pre-fills every test's `ctx.metadata` and surfaces on each
`TestResult.metadata` (useful for cross-browser / sharded reports).

### Data-driven tests

Pass an `input` thunk for a single computed value, or `@Test.each(table)` for a
table. The value is the test method's **first argument**; the `TestContext` (if
you want it) shifts to the second. Plain `method(ctx)` tests are unaffected.

```ts
class Math extends Test() {
  // one computed input → arg #1; the name interpolates it ($1)
  @Test.test({ name: "doubles $1", input: () => 21 })
  doubles(value: number) { expect(value * 2).toBe(42); }

  // …or a TYPED name function — `v` is inferred from the input thunk's return
  @Test.test({ name: (v) => `len ${v.length}`, input: () => makeRows() })
  uses(rows: ReturnType<typeof makeRows>) { /* … */ }

  // a table → one case per row
  @Test.each([[1, 1, 2], [2, 3, 5]] as Array<[number, number, number]>, "$1 + $2")
  adds([a, b, sum]: [number, number, number], ctx?: TestContext) {
    expect(a + b).toBe(sum);
  }
}
```

**Naming.** `name` is either a typed function `(input, index) => string` (the
`input` type is inferred from the `input` thunk, so it's fully type-checked), or
a string template interpolating the input:

| Placeholder | Expands to |
| --- | --- |
| `$1`, `$2`, … | 1-based positional element of an array/tuple input (`$1` = the whole value for a non-array input) |
| `$#` | the case index |
| `$prop` | a property of the input |
| `$$` | a literal `$` |

The table can be an array or a thunk (resolved once when suites are collected).
For `@Test.each`, a plain string name (no `$`) gets ` [i]` appended to keep rows
unique; the default is `methodName [i]`. The `input` thunk is resolved once at
collection (so it runs at run start, and a looping plugin like benchmark reuses
the same value).

## Fixtures

Extend `Fixture<T>({ name?, scope? })`. `setup()` returns the value injected into
dependents; an optional `teardown(value)` runs in reverse order when the scope
ends. Fixtures may depend on other fixtures via `@Fixture.use`.

```ts
class DbFixture extends Fixture<Db>({ scope: "run" }) {
  setup() { return openDb(); }
  teardown(db: Db) { return db.close(); }   // no `override` needed
}
class RepoFixture extends Fixture<Repo>({ scope: "test" }) {
  @Fixture.use(DbFixture) db!: Db;           // fixture-to-fixture dependency
  setup() { return new Repo(this.db); }
}
```

### Disposable values

Instead of `teardown(value)`, a fixture may return a value that implements
`Symbol.dispose` / `Symbol.asyncDispose` — the runner disposes it (awaiting
either) when the scope ends. The `dispose(...)` helper builds one and picks the
symbol from whether the cleanup is async:

```ts
import { Fixture, dispose } from "@youneed/test";

class TmpDirFixture extends Fixture<string>({ scope: "test" }) {
  setup() {
    const dir = mkdtempSync(join(tmpdir(), "t-"));
    return dispose(dir, () => rmSync(dir, { recursive: true }));        // sync → Symbol.dispose
  }
}

class ServerFixture extends Fixture<Server>({ scope: "run" }) {
  setup() {
    const server = startServer();
    return dispose(server, async () => { await server.stop(); });      // async → Symbol.asyncDispose
  }
}
```

`dispose(value, cleanup)` makes `value` disposable in place and returns it;
`dispose(cleanup)` returns a bare disposable. Both also work with JS
`using` / `await using`. If a fixture defines *both* `teardown(value)` and
returns a disposable, both run.

**Scopes** control caching/teardown granularity:

| Scope | Resolved | Torn down |
| --- | --- | --- |
| `"test"` (default) | before each test that uses it | after that test |
| `"suite"` | once per suite | after the suite |
| `"run"` | once for the whole run | at the end of the run |

## Test context

Every test gets one mutable **`TestContext`**, passed as the argument to
`beforeEach`, the test body, and `afterEach` (the same instance throughout), and
handed to reporters on `onTestStart`. It's the extension point for plugins and
integrations — for example a Cucumber-style **World** lives in `ctx.data`:

```ts
import { Test, type TestContext } from "@youneed/test";

class Steps extends Test() {
  @Test.beforeEach() openWorld(ctx: TestContext) {
    ctx.data.set("world", new World());        // shared across this scenario's steps
  }

  @Test.it("a step")
  step(ctx: TestContext) {
    const world = ctx.data.get("world") as World;
    ctx.annotate("tag", "@smoke");             // → TestResult.annotations
    ctx.attach({ name: "log", body: "…" });    // → TestResult.metadata.attachments
    ctx.metadata.browser = "chromium";         // arbitrary report-facing field
  }
}
```

- `ctx.data` — free-form `Map`, in-process only (a World, step state, …).
- `ctx.metadata` — report-facing bag (à la Playwright): set arbitrary fields on
  it, and it always holds `attachments`. `ctx.attach({ name, body|path })` is
  shorthand for pushing into `ctx.metadata.attachments`.
- `ctx.signal` — an `AbortSignal` aborted when the test ends (see below).
- `ctx.annotate(type, description?)` — adds to `ctx.annotations`.
- `annotations` and `metadata` surface on the final `TestResult` and survive the
  blob reporter / `mergeReports`; `data` is in-process only. Plugins stash their
  per-test output on `metadata` too (e.g. `metadata.benchmark`).

Old `foo() {}` methods keep working — the context argument is optional.

### Steps

Wrap a named, timed section with `ctx.step(name, fn)` (or the ambient
`Test.step(name, fn)`), nestable à la Playwright. Steps are recorded on
`TestResult.steps` and rendered by the console reporter; a throwing step records
its message and fails the test.

```ts
@Test.it("checkout")
async flow(ctx: TestContext) {
  await ctx.step("add to cart", async () => { /* … */ });
  await ctx.step("pay", async () => {
    await ctx.step("enter card", async () => { /* nested */ });
  });
}
```

### Abort signal & timeouts

Every `TestContext` carries an **`AbortSignal`** (`ctx.signal`) that is aborted
when the test ends — on **timeout**, on failure, or simply once the body (plus
`afterEach`/teardown) finishes. Thread it into anything that outlives a single
assertion so it's torn down with the test, à la Playwright/Vitest:

```ts
@Test.it("fetches the user", { timeout: 2000 })   // ms; fail + abort if exceeded
async fetchesUser(ctx: TestContext) {
  const res = await fetch(url, { signal: ctx.signal });          // cancelled on timeout
  window.addEventListener("offline", onOff, { signal: ctx.signal }); // auto-removed
  for (const item of huge) {
    if (ctx.signal.aborted) return;                              // bail out of long loops
    /* … */
  }
}
```

- **Per-case timeout** — `@Test.it(name, { timeout })` (also `@Test.test`). When
  exceeded, the case **fails** with a `TimeoutError` and `ctx.signal` is aborted
  with that error as its `reason`.
- **Run-level default** — `TestApplication().timeout(ms)` applies to every case;
  a per-case `timeout` overrides it. `0` (the default) disables timeouts.
- On a non-timeout finish, the abort `reason` is a plain `"test finished"` Error.

> The core timeout owns `ctx.signal`, so it gives you **true cancellation**. The
> separate [`@youneed/test-resilience`](../test-resilience) `timeout()`/`retry()`
> *plugins* are for composition (per-attempt timeouts under retry); they race the
> body but don't abort the signal.

## Reporters

The core ships two built-in reporters: the quiet **`DefaultReporter`** (prints
failures + a final summary), used when none is registered, and **`NoopReporter`**
(prints nothing) — register it to fully silence a run and just read the returned
`RunSummary`. Richer / alternative output lives in **independent, pluggable
packages** named `@youneed/test-reporter-<name>` — install only what you want:

| Package | What it does |
| --- | --- |
| [`@youneed/test-reporter-console`](../test-reporter-console) | colored, per-test/suite output + annotations |
| [`@youneed/test-reporter-html`](../test-reporter-html) | writes a standalone HTML report file |
| [`@youneed/test-reporter-progress`](../test-reporter-progress) | live, interactive per-lane progress (parallel/shard) |
| [`@youneed/test-reporter-tap`](../test-reporter-tap) | TAP v13 output (CI / node:test-compatible) |
| [`@youneed/test-reporter-junit`](../test-reporter-junit) | JUnit XML report file |
| [`@youneed/test-benchmark`](../test-benchmark) | benchmark extension (`@Benchmark` plugin + reporter) |
| [`@youneed/test-resilience`](../test-resilience) | `timeout()` / `retry()` plugins (+ `@Timeout`/`@Retry`) |
| [`@youneed/test-snapshot`](../test-snapshot) | snapshot testing (`snapshot()` plugin + `toMatchSnapshot`) |
| [`@youneed/test-expect-extra`](../test-expect-extra) | richer `expect` (toMatchObject, resolves/rejects, …) |

```ts
import { TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { HTMLReporter } from "@youneed/test-reporter-html";

TestApplication()
  .addTests(MyTest)
  .reporter(new ConsoleReporter())
  .reporter(new HTMLReporter({ output: "report.html" }))
  .run();
```

### Writing your own

Extend `Reporter({ name })` and subscribe to lifecycle events with
`@Reporter.event`. Handlers across all reporters run in ascending `priority`
(lower = earlier, default `0`). Publish it as its own `@youneed/test-reporter-*`
package (depend on `@youneed/test`).

```ts
import { Reporter, type TestResult } from "@youneed/test";

class MyReporter extends Reporter({ name: "mine" }) {
  @Reporter.event("onTestEnd")
  test(r: TestResult) { /* … */ }
}
```

Built-in events: `onRunStart`, `onSuiteStart`, `onTestStart`, `onTestEnd`,
`onSuiteEnd`, `onRunEnd`, plus a **live `onProgress`** (`ProgressEvent` with a
`RunContext` — `mode`/`lane`/`lanes`/`shard`) emitted as each test starts/ends.
Crucially it fires LIVE even during a `.parallel()` run — where the canonical
`onTest*` events are buffered and replayed in order only at the end — so an
interactive reporter (see `@youneed/test-reporter-progress`) can show per-lane
status in real time. Plugins may emit (and reporters subscribe to) **any** custom
string event too.

## Plugins (extensions)

The core is small; capabilities like benchmarking are **pluggable modules**.
Register a plugin with `.use(...)`. A plugin wraps each test case via `runTest`
middleware — call `next()` to run the body once, or LOOP it (that's how
[`@youneed/test-benchmark`](../test-benchmark) measures):

```ts
import { TestApplication, type TestPlugin } from "@youneed/test";

const timing: TestPlugin = {
  name: "timing",
  async runTest(exec) {
    await exec.emit("onMyEvent", { name: exec.ctx.name }); // custom reporter event
    const t0 = performance.now();
    await exec.next();                                     // run the body
    exec.ctx.metadata.elapsed = performance.now() - t0;   // stash on the result
  },
};

TestApplication().addTests(MyTest).use(timing).run();
```

`TestExecution` gives a plugin: `ctx`, `instance` (the suite instance — read
injected fixtures, e.g. `exec.instance.db`), the `suite` class + method `key` (to
look up its own per-case metadata, e.g. set by a custom decorator via the exported
`registerTestCase`), `emit(event, payload)`, and `next()`. Output written to
`ctx.metadata` rides on the `TestResult` (blob-safe), so it survives parallel and
sharded merges automatically.

A plugin can also own run-global resources via `setup`/`teardown` (run once
before/after the run's tests — per worker in worker mode; `teardown` in reverse
order). Handy for starting/stopping a container or coverage:

```ts
const db: TestPlugin = {
  name: "db",
  async setup() { /* start a testcontainer */ },
  async teardown() { /* stop it */ },
  async runTest(exec) {
    const conn = (exec.instance as { db?: Client }).db; // a fixture on the suite
    await conn?.query("BEGIN");
    try { await exec.next(); } finally { await conn?.query("ROLLBACK"); }
  },
};
```

The benchmark extension is the canonical example:

```ts
import { Benchmark, benchmark, BenchmarkReporter } from "@youneed/test-benchmark";

class Perf extends Test() {
  @Benchmark({ name: "sum 1k", iterations: 2000 }) @Test.it()
  sum() { data.reduce((a, b) => a + b, 0); }
}

TestApplication().addTests(Perf).use(benchmark()).reporter(new BenchmarkReporter()).run();
//   ⚡ sum 1k  174,894 ops/sec ±2.1%  (mean 0.0057ms · 2000 samples)
```

## Builder

```ts
TestApplication()
  .addTests(SuiteA, SuiteB)        // explicit suite classes
  .addPattern("foo.test.ts")       // …or discover them by glob (relative to cwd)
  .reporter(new HTMLReporter({ output: "report.html" }))
  .run({ setExitCode: true });     // resolves to a RunSummary
```

## Parallel runs (lanes, workers, sharding + blob reporter)

Three independent dials, all in the same model as Playwright (workers + `--shard`
+ blob reporter / `merge-reports`). Pick by where the bottleneck is.

### `.parallel(n)` — in-process async lanes

Suites run across `n` lanes that execute **concurrently in one process** — no
child processes. Best for **I/O-bound async tests** (network, disk, timers).

```ts
await TestApplication().addTests(...suites).parallel(4).run();
```

Each lane buffers its events in memory; afterwards they're merged in lane order
and replayed through the real reporters as one coherent run, so console output is
never interleaved. The reported `durationMs` is real wall-clock. Each lane gets
its own `"run"` scope (like Playwright's worker-scoped fixtures).

### `.workers(n)` — worker processes

Forks `n` worker **processes** and merges their blobs into one report. True
parallelism (separate event loops) — best for **CPU-bound** suites. (`.shards(n)`
is a kept alias.)

```ts
await TestApplication()
  .addTests(...suites)
  .reporter(new ConsoleReporter())   // used for the FINAL merged report
  .workers(4)
  .run();
```

How it works:

- The **coordinator** forks `N` workers (re-executing the entry with
  `YOUNEED_SHARD=i/N`), waits, then merges and replays the blobs through the
  configured reporters.
- Each **worker** runs only its partition (suites are split deterministically by
  name) with a `BlobReporter` only — it records the raw event stream to
  `blob-report/shard-i-of-N.jsonl` and prints nothing.
- A **`BlobReporter`** records `onSuiteStart/onTestStart/onTestEnd/onSuiteEnd`
  losslessly (errors are serialized), so any reporter replays identically after
  the merge.

### `.shard("i/n")` — split across CI jobs

Run a deterministic subset in-process (with normal reporters, unlike the env
path) and merge the blobs from every job afterwards:

```ts
// CI job i of n:
await TestApplication().addTests(...suites).shard("2/4").blob().run();
```

Distributed across machines via the env contract? Each invocation writes its own
blob; collect and merge them:

```sh
YOUNEED_SHARD=1/3 node run.ts   # on machine 1 → blob-report/shard-1-of-3.jsonl
YOUNEED_SHARD=2/3 node run.ts   # on machine 2
YOUNEED_SHARD=3/3 node run.ts   # on machine 3
```

```ts
import { mergeReports, ConsoleReporter } from "@youneed/test";
await mergeReports({ dir: "blob-report", reporters: [new ConsoleReporter()] });
```

> Because workers re-execute the entry file, any code **after `.run()`** runs in
> every worker too. Keep post-run logic minimal, or branch on
> `process.env.YOUNEED_SHARD` (set only in workers).

## Web server (precondition)

Start a server before the run and stop it after — for E2E/integration suites
that hit a real endpoint, exactly like Playwright's `webServer`:

```ts
await TestApplication()
  .addTests(...suites)
  .webServer({
    command: "node ./server.js",          // run via the shell
    url: "http://127.0.0.1:3000/health",  // …or `port: 3000` (waits for TCP)
    timeout: 60_000,                       // readiness budget (default 60s)
    reuseExistingServer: true,             // default: true off-CI, false on CI
  })
  .run();
```

The run waits until the `url` responds (any HTTP status counts — only a refused
connection is "not ready") or the `port` accepts a connection, then runs the
tests, then kills the process group on teardown. With `reuseExistingServer`, an
already-listening target is reused and left running. Pass an **array** to start
several. It's also exposed as a plugin — `.use(webServer(opts))` — and as CLI
flags (below).

## Assertions

`expect(value)` supports `toBe`, `toEqual` (deep), `toBeDefined`,
`toBeUndefined`, `toBeNull`, `toBeTruthy`, `toBeFalsy`, `toBeGreaterThan`,
`toBeLessThan`, `toContain`, `toHaveLength`, `toThrow`, and `.not`. Failures
throw an `AssertionError`.

## CLI

A `youneed-test` binary discovers test files, runs them, and can watch. Test
files just **export** suites (`export class S extends Test() {…}`) — the CLI
collects them by brand and runs them.

```sh
youneed-test                       # run **/*.test.{ts,tsx,js,jsx,mts,mjs}
youneed-test "src/**/*.spec.ts"    # custom globs
youneed-test -w                    # watch + re-run on change
youneed-test --parallel 4          # in-process lanes
youneed-test --workers 4           # forked workers (blobs merged)
youneed-test --shard 2/4 --blob    # one CI shard + blob
youneed-test --timeout 5000        # default per-test timeout (ms)
youneed-test --web-server "node server.js" --web-server-url http://127.0.0.1:3000
youneed-test --reporter console --reporter junit --output junit.xml
```

`--reporter <name>` loads a built-in (`default`, `noop`) or a
`@youneed/test-reporter-<name>` package (`console`, `tap`, `junit`, `progress`,
`html`) by name. For TypeScript test files, run under a TS loader, e.g.
`node --import tsx node_modules/.bin/youneed-test`.

## Scripts

```sh
pnpm --filter @youneed/test test   # self-test (node:assert)
pnpm --filter @youneed/test demo   # runnable demo (src/bin.ts)
pnpm --filter @youneed/test build
```
