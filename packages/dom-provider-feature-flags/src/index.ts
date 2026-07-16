// ── @youneed/dom-provider-feature-flags — feature flags inside @youneed/dom ──────────
//
// Evaluate an `@youneed/feature-flags` engine straight from an `html` template,
// and have the component re-render when a flag changes (override / source
// reload):
//
//   import { Component, html, when } from "@youneed/dom";
//   import { createFlags } from "@youneed/feature-flags";
//   import { provideFlags, flags, flagged } from "@youneed/dom-provider-feature-flags";
//
//   provideFlags(createFlags([{ key: "new-dashboard", defaultValue: false }]));
//
//   class Dashboard extends Component() {
//     constructor() { super(); flagged(this); }  // re-render on flag change
//     render() {
//       return when(flags().isEnabled("new-dashboard"), () => html`<new-ui></new-ui>`);
//     }
//   }
//
// `flags()` reads the app-wide engine set by `provideFlags(...)` — it returns the
// `FeatureFlags` engine, so its synchronous `isEnabled` / `variant` / `value` /
// `all` drop into any template hole. Reactivity is opt-in per component via
// `flagged(this)`: it subscribes the host to the engine and calls
// `requestUpdate()` on every `onChange` (override or source reload),
// auto-unsubscribing on disconnect (it registers an `onCleanup`).
//
// For a scoped API bound to an `EvaluationContext`, use the `featureFlagsProvider`
// slot (recommended) — it puts a `this.flags` on the component that already
// evaluates against the provider's `context()`, so you never thread the context
// through each call.

import type { ComponentProvider } from "@youneed/dom";
import {
  fromSnapshot,
  type EvaluationContext,
  type Evaluation,
  type FeatureFlags,
  type FlagDefinition,
  type FlagValue,
} from "@youneed/feature-flags";

export type { EvaluationContext, Evaluation, FeatureFlags, FlagDefinition, FlagValue };

/** Minimal host surface `flagged` needs — satisfied by any `@youneed/dom`
 *  component (`ReactiveHost`). */
export interface FlaggableHost {
  requestUpdate(): void;
  onCleanup(teardown: () => void): void;
}

/**
 * The provider's contribution, exposed as `this.flags`. Each method evaluates
 * against the provider's `context()` — a scoped view of a {@link FeatureFlags}
 * engine that doesn't need the context threaded through every call.
 */
export interface FlagsApi {
  /** Boolean check for `key` against the scoped context. */
  isEnabled(key: string): boolean;
  /** The selected variant name for `key`, if any. */
  variant(key: string): string | undefined;
  /** The typed value for `key`, with a `fallback` when the flag is unknown. */
  value<T extends FlagValue = FlagValue>(key: string, fallback?: T): T;
  /** The full evaluation for `key` (value + variant + reason). */
  evaluate<T extends FlagValue = FlagValue>(key: string): Evaluation<T>;
  /** Evaluate EVERY flag against the scoped context. */
  all(): Record<string, Evaluation>;
}

let current: FeatureFlags | undefined;

/** Install the app-wide flags engine that `flags(...)` / `flagged(...)` read
 *  from. Returns the instance so you can keep a reference. */
export function provideFlags<T extends FeatureFlags>(instance: T): T {
  current = instance;
  return instance;
}

/** The active flags engine. Throws if `provideFlags(...)` hasn't run yet. */
export function getFlags(): FeatureFlags {
  if (!current) throw new Error("[feature-flags-dom] no engine — call provideFlags(...) first");
  return current;
}

/** The app-wide flags engine — for use directly in `html` template holes:
 *  `when(flags().isEnabled("x"), …)`. Alias of {@link getFlags}. */
export function flags(): FeatureFlags {
  return getFlags();
}

/**
 * Subscribe a component to flag changes: every `onChange` (override / source
 * reload) triggers a `requestUpdate()`, so templates that read `flags(...)`
 * re-render with the new value. Unsubscribes automatically on disconnect. Call
 * it once, e.g. in the constructor or `onMount`. Pass an explicit `instance` to
 * bind to a specific engine instead of the app-wide one.
 *
 * Returns the unsubscribe (also registered via `host.onCleanup`).
 */
export function flagged(host: FlaggableHost, instance: FeatureFlags = getFlags()): () => void {
  const off = instance.onChange(() => host.requestUpdate());
  host.onCleanup(off);
  return off;
}

// ── hydrateFlags — SSR → client rehydration ───────────────────────────────────
//
// The SSR plugin evaluates `engine.all(ctx)` on the server, serialises the record
// (e.g. `window.__FLAGS__`), and the client rebuilds a read-only engine from it —
// no flag definitions shipped, values match exactly what the server rendered.

/** The snapshot record the SSR plugin injects — a map of key → {@link Evaluation}. */
export type FlagsSnapshot = Record<string, Evaluation>;

/**
 * Build a read-only flags engine from an SSR snapshot (`engine.all(ctx)` on the
 * server) and install it as the app-wide engine (so `flags()` / `flagged()` work
 * on the client without re-declaring definitions). Returns the engine.
 *
 * Reads a record directly, or a global name to pick it off `window` (defaults to
 * `__FLAGS__`, matching the SSR plugin's injection).
 */
export function hydrateFlags(snapshot?: FlagsSnapshot | string): FeatureFlags {
  const record =
    typeof snapshot === "string" || snapshot === undefined
      ? ((globalThis as Record<string, unknown>)[snapshot ?? "__FLAGS__"] as FlagsSnapshot | undefined)
      : snapshot;
  if (!record) throw new Error("[feature-flags-dom] no SSR snapshot to hydrate from");
  return provideFlags(fromSnapshot(record));
}

// ── featureFlagsProvider — a scoped `this.flags` as a Component provider ─────────
//
// `flagged` wires the app-wide engine's reactivity onto a component;
// `featureFlagsProvider` plugs into the framework's `Component(tag, { providers:
// [...] })` slot — the DOM analogue of a server `Controller`'s `guards` /
// `interceptors`. It adds a `this.flags` bound to a given engine AND an
// `EvaluationContext`, and auto-wires reactivity (re-render on flag change,
// cleanup on disconnect):
//
//   class Card extends Component("x-card", {
//     providers: [featureFlagsProvider(engine, { context: () => ({ targetingKey: user.id }) })],
//   }) {
//     render() {
//       return when(this.flags.isEnabled("new-ui"), () => html`<new-ui></new-ui>`);
//     }
//   }

export interface FeatureFlagsProviderOptions {
  /** The evaluation context every `this.flags.*` call runs against. Called per
   *  evaluation, so it may read live state (current user, route, …). Default `{}`. */
  context?: () => EvaluationContext;
}

/** A composable `Component` provider adding a scoped `this.flags` API bound to an
 *  {@link FeatureFlags} engine + an {@link EvaluationContext}, auto-wiring
 *  reactivity (re-render on flag change, cleanup on disconnect). */
export function featureFlagsProvider(
  engine: FeatureFlags,
  options: FeatureFlagsProviderOptions = {},
): ComponentProvider<{ readonly flags: FlagsApi }> {
  const context = options.context ?? (() => ({}));
  return {
    install(host) {
      const api: FlagsApi = {
        isEnabled: (key) => engine.isEnabled(key, context()),
        variant: (key) => engine.variant(key, context()),
        value: <T extends FlagValue = FlagValue>(key: string, fallback?: T) =>
          engine.value<T>(key, context(), fallback),
        evaluate: <T extends FlagValue = FlagValue>(key: string) => engine.evaluate<T>(key, context()),
        all: () => engine.all(context()),
      };
      Object.defineProperty(host, "flags", { configurable: true, value: api });
      flagged(host, engine);
    },
  };
}

// ── withFlags — the same contribution as a base-class mixin ──────────────────────
//
// Equivalent to a single `featureFlagsProvider`, in `extends withFlags(Base,
// engine)` form — handy when you're already chaining mixins:
//
//   class Card extends withFlags(Component("x-card"), engine) {
//     render() { return when(this.flags.isEnabled("x"), …); }
//   }

/** A constructor that may be `abstract` — so the `Component(...)` factory's
 *  abstract result can be used as a mixin base. */
export type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;

/** What the mixin needs from its base: a reactive `@youneed/dom` component. */
type ReactiveBase = HTMLElement & FlaggableHost;

/**
 * Mix a scoped `this.flags` API onto a Component base, bound to an
 * {@link FeatureFlags} engine + an {@link EvaluationContext}, with reactivity
 * auto-wired. Composition mirrors `Component(tag, Base)`: `withFlags(Component("x"),
 * engine)` returns a base your component `extends`. Chainable with other mixins.
 */
export function withFlags<TBase extends AbstractConstructor<ReactiveBase>>(
  Base: TBase,
  engine: FeatureFlags,
  options: FeatureFlagsProviderOptions = {},
): TBase & AbstractConstructor<{ readonly flags: FlagsApi }> {
  const provider = featureFlagsProvider(engine, options);
  abstract class WithFlags extends Base {
    constructor(...args: any[]) {
      super(...args);
      provider.install(this as unknown as ReactiveBase & Parameters<typeof provider.install>[0]);
    }
  }
  return WithFlags as unknown as TBase & AbstractConstructor<{ readonly flags: FlagsApi }>;
}
