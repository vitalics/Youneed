# @youneed/test — Authoring tests

Source: `packages/test/src/{index,mock}.ts`, `packages/test/README.md`.

## Suites & cases

Extend `Test(options?)` and decorate methods. One instance is created per suite.

```ts
import { Test, expect, type TestContext } from "@youneed/test";

class MathTest extends Test({ name: "Math" }) {       // name defaults to the class name
  @Test.it("adds") add() { expect(1 + 1).toBe(2); }
  @Test.test("alias for it") b() {}                    // @Test.test === @Test.it
  @Test.only("focus me") c() {}                        // restricts the WHOLE run to only-cases
  @Test.skip("not yet") d() {}
}
```

| Decorator | Purpose |
|------|------|
| `@Test.it(name?, { skip?, only?, input?, timeout? })` | a test case (alias `@Test.test`) |
| `@Test.each(table, name?)` | data-driven — one case per row |
| `@Test.only` / `@Test.skip` | focus / skip |
| `@Test.beforeEach()` / `@Test.afterEach()` | run around every case (get `ctx`) |
| `@Test.beforeAll()` / `@Test.afterAll()` | run once per suite |
| `@Test.use(Fixture)` | inject a fixture value into a field |

The test method receives the `TestContext` as its argument (optional — old
`foo() {}` methods still work). `beforeEach`/`afterEach` get the **same** context.

**Conditional skip** — `skip` can be a predicate `(ctx) => boolean | string`,
evaluated at run time (return a string to record a reason). It can branch on
`ctx.run` (lane/shard), env, or run-level params seeded via `.context({...})`:

```ts
@Test.it("firefox only", { skip: (ctx) => ctx.metadata.browser !== "firefox" }) f() {}
// TestApplication().addTests(S).context({ browser: process.env.BROWSER }).run();
```

## Data-driven (`input` + `@Test.each`)

```ts
@Test.test({ input: () => 21 * 2 })                    // value is arg #1; ctx shifts to arg #2
answer(value: number, ctx: TestContext) { expect(value).toBe(42); }

@Test.each([[1, 1, 2], [2, 3, 5]], "$1 + $2")          // one case per row; row is arg #1
adds([a, b, sum]: number[]) { expect(a + b).toBe(sum); }
```

`name` can be a template (`"$1 + $2 [$#]"` — `$N` positional, `$#` index, `$prop`,
`$$` literal `$`) or a typed `(value, index) => string`. The `input`/table thunk is
resolved **once at collection time**.

## Fixtures (scoped setup/teardown)

A fixture is a reusable, scoped value with setup + optional teardown. Inject it with
`@Test.use(Fix)` (decorator) or `x = Fix.get()` (decorator-free field initializer).

```ts
class Db extends Fixture<Pool>({ name: "db", scope: "suite" }) {
  setup() { return new Pool(); }
  teardown(pool: Pool) { return pool.end(); }          // or return a disposable from setup()
}
class Client extends Fixture<Api>({ scope: "test" }) {
  @Fixture.use(Db) db!: Pool;                          // fixtures can depend on fixtures
  setup() { return new Api(this.db); }
}
class S extends Test() {
  @Test.use(Client) api!: Api;
  db = Db.get();                                        // decorator-free injection
}
```

| Scope | Resolved | Torn down |
|------|------|------|
| `"test"` (default) | before each test that uses it | after that test |
| `"suite"` | once per suite | after the suite |
| `"run"` | once per run (per lane/worker) | at run end |

Teardown runs in reverse order. A fixture can instead **return a disposable** built
with `dispose(value, cleanup)` / `dispose(asyncCleanup)` (`Symbol.dispose` /
`Symbol.asyncDispose`) and it's disposed at scope end. Dependency cycles throw.

## Assertions, mocks

`expect(v)` matchers: `toBe` (`Object.is`), `toEqual` (deep), `toBeDefined`,
`toBeUndefined`, `toBeNull`, `toBeTruthy`, `toBeFalsy`, `toBeGreaterThan`,
`toBeLessThan`, `toContain`, `toHaveLength`, `toThrow(msg?|regex)`, the mock matchers
(`toHaveBeenCalled[Times|With]`, `toHaveBeenLastCalledWith`,
`toHaveBeenNthCalledWith`, `toHaveReturnedWith`), and `.not`. Failures throw
`AssertionError`. Richer matchers (`toMatchObject`, `resolves`/`rejects`, …) live in
`@youneed/test-expect-extra`; snapshots in `@youneed/test-snapshot`.

```ts
import { fn, spyOn, expect } from "@youneed/test";

const cb = fn((x: number) => x * 2);
cb(21); expect(cb).toHaveBeenCalledWith(21); expect(cb.mock.calls.length).toBe(1);

const spy = spyOn(mailer, "send").mockReturnValue(true);   // wrap a real method
// spyOn patches are auto-restored after each test; fn() stubs: mockReturnValue,
// mockResolvedValue, mockImplementation(+Once), mockClear/mockReset/mockRestore.
```

## TestContext: data, steps, annotations, attachments

```ts
@Test.beforeEach() open(ctx: TestContext) { ctx.data.set("world", new World()); }  // in-process Map
@Test.it("checkout")
async flow(ctx: TestContext) {
  await ctx.step("add to cart", async () => { /* nestable, timed → TestResult.steps */ });
  ctx.annotate("issue", "JIRA-123");                 // → TestResult.annotations
  ctx.attach({ name: "log", body: "…" });            // → TestResult.metadata.attachments
  ctx.metadata.browser = "chromium";                 // arbitrary report-facing field
}
```

`data` is in-process only; `annotations`/`metadata`/`steps` ride on the `TestResult`
and survive the blob reporter + `mergeReports`. `Test.step(name, fn)` is the ambient
form when you don't have `ctx` threaded in.

## ctx.signal (cancellation) & timeouts

Every `TestContext` carries an **`AbortSignal`** (`ctx.signal`) that is aborted when
the test ends — on **timeout**, on failure, or once the body (+ `afterEach`/teardown)
finishes. Thread it into anything that outlives a single assertion:

```ts
@Test.it("streams", { timeout: 2000 })               // per-case timeout (ms)
async streams(ctx: TestContext) {
  const res = await fetch(url, { signal: ctx.signal });            // cancelled on timeout
  window.addEventListener("offline", onOff, { signal: ctx.signal }); // auto-removed at test end
  for (const item of huge) { if (ctx.signal.aborted) return; /* … */ }  // bail out early
}
```

- **Per-case**: `@Test.it(name, { timeout })`. Exceeding it **fails** the case with a
  `TimeoutError` and aborts `ctx.signal` with that error as its `reason`.
- **Run-level default**: `TestApplication().timeout(ms)` for every case; a per-case
  `timeout` overrides it. `0` (the default) = no timeout.
- On a non-timeout finish, the abort `reason` is a plain `"test finished"` Error.

> The **core** timeout owns `ctx.signal`, giving true cancellation. The separate
> `@youneed/test-resilience` `timeout()`/`retry()` *plugins* are for composition
> (per-attempt timeouts under retry); they race the body but don't abort the signal.
