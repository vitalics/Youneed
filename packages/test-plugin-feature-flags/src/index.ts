// ── @youneed/test-plugin-feature-flags — deterministic feature flags in @youneed/test ──
//
// Flags are great in prod and murder in tests: one case flips `new-checkout` on,
// the next inherits it, and now your suite passes or fails depending on order.
// This package makes flags DETERMINISTIC per test — a fresh `FeatureFlags`
// engine each case, overrides wiped between them — and gives you a scoped
// `withFlags(...)` for forcing a value for exactly one block.
//
//   import { Test, TestApplication, expect } from "@youneed/test";
//   import { flagsFixture, withFlags, expectFlag } from "@youneed/test-plugin-feature-flags";
//
//   const Flags = flagsFixture([
//     { key: "new-checkout", defaultValue: false },
//     { key: "theme", defaultValue: "light", variants: { light: "light", dark: "dark" } },
//   ]);
//
//   class Checkout extends Test() {
//     @Test.use(Flags) flags!: FeatureFlags;   // …or: flags = Flags.get();
//
//     @Test.it("off by default") off() {
//       expect(this.flags.isEnabled("new-checkout")).toBeFalsy();
//     }
//
//     @Test.it("forced on for THIS test only") on() {
//       this.flags.override("new-checkout", true);
//       expect(this.flags.isEnabled("new-checkout")).toBeTruthy();
//       // the next test gets a fresh engine — no leak.
//     }
//
//     @Test.it("scoped override restores after the block") scoped() {
//       withFlags(this.flags, { "new-checkout": true }, () => {
//         expectFlag(this.flags, "new-checkout"); // enabled inside
//       });
//       expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); // restored
//     }
//   }
//
//   TestApplication().addTests(Checkout).run();

import { AssertionError, Fixture, type FixtureClass, type FixtureScope } from "@youneed/test";
import {
  createFlags,
  FeatureFlags,
  type EvaluationContext,
  type FlagDefinition,
  type FlagSource,
  type FlagValue,
} from "@youneed/feature-flags";

/** A map of flag key → forced value, applied as overrides by {@link withFlags}. */
export type FlagOverrides = Record<string, FlagValue>;

export interface FlagsFixtureOptions {
  /** Display name (defaults to `"feature-flags"`). */
  name?: string;
  /**
   * Fixture scope (default `"test"`). Keep `"test"` for determinism — every case
   * gets a brand-new engine, so overrides can NEVER leak into the next test. A
   * wider scope (`"suite"`/`"run"`) shares one engine; `teardown` still clears
   * overrides when that scope ends, but cases within it share state.
   */
  scope?: FixtureScope;
}

/**
 * Build a {@link https://…|@youneed/test} fixture that provides a fresh
 * {@link FeatureFlags} engine to each test. Consume it with `@Test.use(Fix)` or
 * decorator-free via `Fix.get()`.
 *
 * Because the default scope is `"test"`, a new engine is constructed for every
 * case — so any `override(...)` a test applies is GONE for the next one, no manual
 * reset needed. `teardown` additionally clears overrides on the resolved engine
 * (belt-and-braces, and the meaningful reset when you opt into a wider scope).
 *
 * @param defs Flag definitions (or a {@link FlagSource}) the engine starts with.
 *             A fresh engine is built per resolution, so tests never share state.
 */
export function flagsFixture(
  defs: FlagDefinition[] | FlagSource = [],
  opts: FlagsFixtureOptions = {},
): FixtureClass<FeatureFlags> {
  class FeatureFlagsFixture extends Fixture<FeatureFlags>({
    name: opts.name ?? "feature-flags",
    scope: opts.scope ?? "test",
  }) {
    override setup(): FeatureFlags {
      // A brand-new engine per resolution: definitions are copied in, overrides
      // start empty — the root of the per-test determinism guarantee.
      return createFlags(defs);
    }

    teardown(flags: FeatureFlags): void {
      // Clear every override so nothing survives the scope. For test-scope this is
      // redundant (the instance is discarded), but it's the real reset for wider
      // scopes and keeps the contract honest regardless of scope.
      for (const key of Object.keys(flags.overrides())) flags.override(key, undefined);
    }
  }
  return FeatureFlagsFixture as unknown as FixtureClass<FeatureFlags>;
}

/**
 * Run `fn` with `overrides` forced on `flags`, restoring the PREVIOUS state of
 * each touched key afterwards — even if `fn` throws. A key that had no override
 * before is cleared back to unset; one that did is restored to its prior value.
 *
 * Synchronous `fn` runs and restores synchronously; an async `fn` (returning a
 * Promise) is awaited and restored in a `finally`. The return type follows `fn`.
 *
 *   withFlags(flags, { beta: true }, () => { … });               // sync
 *   await withFlags(flags, { beta: true }, async () => { … });   // async
 */
export function withFlags<R>(flags: FeatureFlags, overrides: FlagOverrides, fn: () => R): R;
export function withFlags<R>(flags: FeatureFlags, overrides: FlagOverrides, fn: () => Promise<R>): Promise<R>;
export function withFlags<R>(
  flags: FeatureFlags,
  overrides: FlagOverrides,
  fn: () => R | Promise<R>,
): R | Promise<R> {
  const keys = Object.keys(overrides);
  // Snapshot only the keys we're about to touch, so restore is precise.
  const previous = flags.overrides();
  const restore = () => {
    for (const key of keys) {
      if (key in previous) flags.override(key, previous[key]);
      else flags.override(key, undefined);
    }
  };

  for (const key of keys) flags.override(key, overrides[key]);

  let result: R | Promise<R>;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result instanceof Promise) {
    return result.then(
      (v) => {
        restore();
        return v;
      },
      (err) => {
        restore();
        throw err;
      },
    );
  }
  restore();
  return result;
}

/**
 * Ergonomic assertion: throw an `AssertionError` unless `flags.isEnabled(key,
 * ctx)` is truthy. Sugar over `expect(flags.isEnabled(key, ctx)).toBeTruthy()`
 * with a message that names the flag and its actual evaluation.
 *
 * `@youneed/test`'s `expect` matcher set is fixed (extra matchers come from
 * swapping the `expect` import, not a register API), so this is a plain
 * `AssertionError`-throwing helper rather than a custom matcher — usable inside
 * any `@Test.it` regardless of which `expect` is imported.
 */
export function expectFlag(flags: FeatureFlags, key: string, ctx?: EvaluationContext): void {
  const ev = flags.evaluate(key, ctx);
  if (!ev.value) {
    throw new AssertionError(
      `expected feature flag "${key}" to be enabled, but it evaluated to ${JSON.stringify(ev.value)} (reason: ${ev.reason})`,
    );
  }
}

/**
 * The inverse of {@link expectFlag}: throw unless `flags.isEnabled(key, ctx)` is
 * falsy.
 */
export function expectFlagDisabled(flags: FeatureFlags, key: string, ctx?: EvaluationContext): void {
  const ev = flags.evaluate(key, ctx);
  if (ev.value) {
    throw new AssertionError(
      `expected feature flag "${key}" to be disabled, but it evaluated to ${JSON.stringify(ev.value)} (reason: ${ev.reason})`,
    );
  }
}

export { FeatureFlags };
export type { EvaluationContext, FlagDefinition, FlagSource, FlagValue };
