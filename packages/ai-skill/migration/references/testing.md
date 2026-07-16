# Tests → @youneed/test (Jest / Vitest / Mocha / Jasmine)

@youneed/test = class + TC39-decorator test framework: suites `extend Test()`, cases are
`@Test.it` methods, `Fixture()` gives scoped setup/teardown, `expect` matchers, `fn`/`spyOn`
mocks. Full API in the `youneed-test` skill. Migrate a unit's tests **with** the unit — don't
batch them to the end of the migration.

## Jest / Vitest → @youneed/test

Jest and Vitest map almost identically (Vitest is Jest-API-compatible).

| Jest / Vitest | @youneed/test |
|---------------|---------------|
| `describe("X", () => {...})` | `class X extends Test() {}` (the suite is a class) |
| `it("does y", () => {...})` / `test(...)` | `@Test.it("does y") y() {}` (a method) |
| `it.each(rows)(...)` | `@Test.each(rows) name(row) {}` |
| `it.skip` / `it.only` / `it.todo` | `@Test.it.skip` / `.only` / `.todo` |
| `beforeEach`/`afterEach`/`beforeAll`/`afterAll` | `Fixture()` scoped setup/teardown |
| `expect(x).toBe/toEqual/toThrow(...)` | `expect(x).toBe/toEqual/toThrow(...)` (same matchers) |
| `jest.fn()` / `vi.fn()` | `fn()` |
| `jest.spyOn(o,"m")` / `vi.spyOn` | `spyOn(o,"m")` |
| `jest.mock("mod")` module mock | prefer dependency injection + `fn()` over module-level mocks |
| `test.concurrent` / `--maxWorkers` | parallel / worker / shard run (see `youneed-test`) |
| `expect().toMatchSnapshot()` | snapshot plugin (`@youneed/test`) |
| Playwright `webServer` precondition | built-in webServer precondition (à la Playwright) |
| custom reporters | `@youneed/test-reporter-*` ecosystem |
| async timeout / `AbortSignal` | `TestContext`: `ctx.signal` + per-test timeout |

## Mocha / Jasmine → @youneed/test

`describe/it` → suite class + `@Test.it`; `before/after/beforeEach/afterEach` → `Fixture()`;
Chai/Jasmine assertions → `expect` matchers; Sinon spies/stubs → `spyOn`/`fn`. Same class
reshape as the Jest mapping.

## Migration tactics

1. **Suite = class, case = decorated method.** The mechanical reshape is `describe`→class,
   `it`→`@Test.it`. Do it per file as you migrate the code under test.
2. **Shared setup → `Fixture()`.** Replace the `beforeEach` chain with a scoped fixture; it
   composes better than nested hooks.
3. **Prefer DI over module mocks.** `jest.mock`/`vi.mock` module interception has no direct
   analog — inject collaborators and swap them with `fn()`. This also matches youneed's
   constructor-injection wiring on both server and frontend.
4. **E2E web server as a precondition** replaces a separately-launched Playwright server —
   wire it into the suite instead of a global setup script.
5. **Run both suites during cutover.** Keep the old runner green until the ported suite passes
   the same cases; then delete the old test + runner config together.
