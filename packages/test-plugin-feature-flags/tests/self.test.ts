// Run: pnpm --filter @youneed/test-plugin-feature-flags test
import { Test, TestApplication, expect, AssertionError } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { FeatureFlags } from "@youneed/feature-flags";
import { flagsFixture, withFlags, expectFlag, expectFlagDisabled } from "../src/index.ts";

const Flags = flagsFixture([
  { key: "new-checkout", defaultValue: false },
  { key: "theme", defaultValue: "light", variants: { light: "light", dark: "dark" }, defaultVariant: "light" },
]);

// ── determinism: overrides applied in one test are RESET for the next ──────────
// These two cases run in registration order. `a` forces the flag on; `b` must see
// a pristine engine (off again). If the fixture leaked, `b` would fail.
class Isolation extends Test({ name: "override isolation" }) {
  @Test.use(Flags) flags!: FeatureFlags;

  @Test.it("a: override applies within the test") a() {
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); // default
    this.flags.override("new-checkout", true);
    expect(this.flags.isEnabled("new-checkout")).toBeTruthy(); // forced on
    expect(this.flags.overrides()).toEqual({ "new-checkout": true });
  }

  @Test.it("b: the next test gets a fresh engine (override reset)") b() {
    // Would be `true` and `{ 'new-checkout': true }` if state leaked from `a`.
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy();
    expect(this.flags.overrides()).toEqual({});
  }
}

// ── decorator-free injection via .get() also isolates per test ─────────────────
class GetIsolation extends Test({ name: "get() isolation" }) {
  flags = Flags.get();

  @Test.it("a: force theme to dark") a() {
    this.flags.override("theme", "dark");
    expect(this.flags.value("theme")).toBe("dark");
  }

  @Test.it("b: theme is back to its default variant") b() {
    expect(this.flags.value("theme")).toBe("light");
    expect(this.flags.overrides()).toEqual({});
  }
}

// ── withFlags: applies inside, restores after (sync + async + on throw) ────────
class WithFlags extends Test({ name: "withFlags" }) {
  @Test.use(Flags) flags!: FeatureFlags;

  @Test.it("sync: forced inside, restored after") sync() {
    let inside = false;
    withFlags(this.flags, { "new-checkout": true }, () => {
      inside = this.flags.isEnabled("new-checkout");
    });
    expect(inside).toBeTruthy(); // applied within fn
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); // restored
    expect(this.flags.overrides()).toEqual({}); // cleared (had none before)
  }

  @Test.it("async: awaited then restored") async asyncRestore() {
    let inside = false;
    await withFlags(this.flags, { "new-checkout": true }, async () => {
      await Promise.resolve();
      inside = this.flags.isEnabled("new-checkout");
    });
    expect(inside).toBeTruthy();
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy();
  }

  @Test.it("restores even when fn throws") onThrow() {
    let threw = false;
    try {
      withFlags(this.flags, { "new-checkout": true }, () => {
        throw new Error("boom");
      });
    } catch {
      threw = true;
    }
    expect(threw).toBeTruthy();
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); // restored despite throw
  }

  @Test.it("restores a PRE-EXISTING override to its prior value, not unset") preExisting() {
    this.flags.override("new-checkout", true); // prior state: on
    withFlags(this.flags, { "new-checkout": false }, () => {
      expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); // forced off inside
    });
    expect(this.flags.isEnabled("new-checkout")).toBeTruthy(); // restored to prior `true`
  }

  @Test.it("returns fn's value (sync)") returnsSync() {
    const r = withFlags(this.flags, { theme: "dark" }, () => this.flags.value("theme"));
    expect(r).toBe("dark");
  }
}

// ── expectFlag / expectFlagDisabled matchers ───────────────────────────────────
class Matchers extends Test({ name: "expectFlag" }) {
  @Test.use(Flags) flags!: FeatureFlags;

  @Test.it("expectFlag passes when enabled") pass() {
    this.flags.override("new-checkout", true);
    expectFlag(this.flags, "new-checkout"); // must not throw
    expect(true).toBeTruthy();
  }

  @Test.it("expectFlag throws AssertionError when disabled") fail() {
    let err: unknown;
    try {
      expectFlag(this.flags, "new-checkout");
    } catch (e) {
      err = e;
    }
    expect(err instanceof AssertionError).toBeTruthy();
    expect(String((err as Error).message).includes("new-checkout")).toBeTruthy();
  }

  @Test.it("expectFlagDisabled passes on the default-off flag") disabled() {
    expectFlagDisabled(this.flags, "new-checkout");
    expect(true).toBeTruthy();
  }

  @Test.it("respects evaluation context") withCtx() {
    const flags = flagsFixture([
      { key: "pro-only", defaultValue: false, rules: [{ attributes: { plan: "pro" }, value: true }] },
    ]);
    // build a fresh engine directly for a context-driven check
    const F = new flags();
    const engine = F.setup();
    expectFlag(engine, "pro-only", { attributes: { plan: "pro" } });
    expectFlagDisabled(engine, "pro-only", { attributes: { plan: "free" } });
    expect(true).toBeTruthy();
  }
}

await TestApplication()
  .addTests(Isolation)
  .addTests(GetIsolation)
  .addTests(WithFlags)
  .addTests(Matchers)
  .reporter(new ConsoleReporter())
  .run();
