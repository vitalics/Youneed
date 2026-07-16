# @youneed/test-plugin-feature-flags

Deterministic feature flags in [`@youneed/test`](../test). Flags are murder in
tests: one case flips a flag on, the next inherits it, and now your suite passes
or fails by order. This package gives every test a **fresh** [`FeatureFlags`](../feature-flags)
engine (overrides wiped between cases) plus a scoped `withFlags(...)` for forcing
a value for exactly one block.

```ts
import { Test, TestApplication, expect } from "@youneed/test";
import { flagsFixture, withFlags, expectFlag } from "@youneed/test-plugin-feature-flags";
import type { FeatureFlags } from "@youneed/feature-flags";

const Flags = flagsFixture([
  { key: "new-checkout", defaultValue: false },
  { key: "theme", defaultValue: "light", variants: { light: "light", dark: "dark" } },
]);

class Checkout extends Test() {
  @Test.use(Flags) flags!: FeatureFlags; // …or decorator-free: flags = Flags.get();

  @Test.it("off by default") off() {
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy();
  }

  @Test.it("forced on for THIS test only") on() {
    this.flags.override("new-checkout", true);
    expectFlag(this.flags, "new-checkout");
    // the next test gets a fresh engine — no leak.
  }

  @Test.it("scoped override restores after the block") scoped() {
    withFlags(this.flags, { "new-checkout": true }, () => {
      expectFlag(this.flags, "new-checkout"); // enabled inside
    });
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); // restored
  }
}

TestApplication().addTests(Checkout).run();
```

`flagsFixture` is scoped `"test"` by default, so a new engine is constructed for
every case — any `override(...)` a test applies is **gone** for the next one, no
manual reset needed. Consume it with `@Test.use(Fix)` or decorator-free via
`Fix.get()`, exactly like any other `@youneed/test` fixture.

| API | meaning |
| --- | --- |
| `flagsFixture(defs?, opts?)` | a `@youneed/test` fixture providing a fresh `FeatureFlags` per test; resets overrides between tests |
| `withFlags(flags, overrides, fn)` | run `fn` with forced overrides, restoring prior state after (sync + async, even on throw) |
| `expectFlag(flags, key, ctx?)` | throw an `AssertionError` unless the flag evaluates truthy |
| `expectFlagDisabled(flags, key, ctx?)` | throw unless the flag evaluates falsy |

| `flagsFixture` option | default | meaning |
| --- | --- | --- |
| `name` | `"feature-flags"` | fixture display name |
| `scope` | `"test"` | fixture scope; keep `"test"` for per-case isolation (`"suite"`/`"run"` share one engine, teardown clears overrides when the scope ends) |
