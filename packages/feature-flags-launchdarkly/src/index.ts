// @youneed/feature-flags-launchdarkly — a REMOTE PROVIDER ADAPTER for
// `@youneed/feature-flags`, backed by the LaunchDarkly **Node server SDK**
// (`@launchdarkly/node-server-sdk`).
//
// Pass it to the engine as the remote evaluator:
//
//   import { FeatureFlags } from "@youneed/feature-flags";
//   import { launchDarklyProvider } from "@youneed/feature-flags-launchdarkly";
//
//   const flags = new FeatureFlags([], { provider: launchDarklyProvider({ sdkKey: "sdk-…" }) });
//   const ev = await flags.evaluateAsync("new-dashboard", { targetingKey: user.id });
//
// The engine caches provider results per `(key, context)` for synchronous reads
// and calls `resolve` in the background; `init()` runs on construction and
// `onChange` clears the cache. This adapter implements the `FlagProvider`
// contract by translating our `EvaluationContext` → an LD context and LD's
// `variationDetail` → our `Evaluation`.
//
// `@launchdarkly/node-server-sdk` is an OPTIONAL dependency, imported *lazily*
// on `init()` and typed structurally below — so the build (and tests, via an
// injected fake `client`) never hard-require the SDK.

import type { Evaluation, EvaluationContext, EvaluationReason, FlagProvider, FlagValue } from "@youneed/feature-flags";

// ── local structural types for the LD server SDK ────────────────────────────
// We intentionally do NOT depend on the SDK's type declarations (no `@types`,
// no import type from the package). These minimal shapes describe only what we
// touch, so `tsc` succeeds even when the SDK is not installed.

/** LD's evaluation reason (`ld.reason`). We only branch on `.kind`. */
export interface LDEvaluationReason {
  kind: string;
  [k: string]: unknown;
}

/** LD's `variationDetail` result. */
export interface LDEvaluationDetail {
  value: unknown;
  variationIndex?: number | null;
  reason?: LDEvaluationReason | null;
}

/** The multi-kind context LD evaluates against (we build a single `user` kind). */
export interface LDContext {
  kind: string;
  key: string;
  [k: string]: unknown;
}

/** LD's `allFlagsState` result — only `.allValues()` is used, for `keys()`. */
export interface LDFlagsState {
  allValues?(): Record<string, unknown>;
}

/** The subset of the LaunchDarkly server client we call. */
export interface LDClient {
  waitForInitialization?(opts?: { timeout?: number }): Promise<unknown>;
  variationDetail(key: string, context: LDContext, defaultValue: unknown): Promise<LDEvaluationDetail>;
  allFlagsState?(context: LDContext): Promise<LDFlagsState> | LDFlagsState;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  off?(event: string, cb: (...args: unknown[]) => void): void;
  close?(): Promise<void> | void;
}

/** Minimal shape of the SDK module's `init` factory. */
interface LDModule {
  init(sdkKey: string, options?: Record<string, unknown>): LDClient;
}

// ── options ─────────────────────────────────────────────────────────────────

export interface LaunchDarklyProviderOptions {
  /** LaunchDarkly server-side SDK key. */
  sdkKey: string;
  /** Inject a pre-built client (tests / custom wiring). Skips the lazy SDK import. */
  client?: LDClient;
  /** Timeout (seconds) passed to `waitForInitialization`. Default `5`. */
  timeoutMs?: number;
  /** Run the SDK in offline mode (no streaming/polling; served defaults). */
  offline?: boolean;
}

// ── reason mapping ──────────────────────────────────────────────────────────

/** LD reason kinds that mean "the flag served a targeted value". */
const SERVED_KINDS = new Set(["FALLTHROUGH", "RULE_MATCH", "TARGET_MATCH"]);

/** Map an LD reason `.kind` to our {@link EvaluationReason}. */
function mapReason(kind: string | undefined): EvaluationReason {
  if (kind && SERVED_KINDS.has(kind)) return "TARGETING_MATCH";
  if (kind === "ERROR") return "ERROR";
  return "DEFAULT";
}

/** Translate our {@link EvaluationContext} into an LD single-kind user context. */
export function toLDContext(ctx: EvaluationContext): LDContext {
  return { kind: "user", key: ctx.targetingKey ?? "anonymous", ...(ctx.attributes ?? {}) };
}

// ── the provider ──────────────────────────────────────────────────────────────

/**
 * A {@link FlagProvider} backed by LaunchDarkly. Lazily imports
 * `@launchdarkly/node-server-sdk` on {@link FlagProvider.init} unless a `client`
 * is injected (tests) or `offline` is set. Every `resolve` calls the SDK's
 * `variationDetail` and maps the result to our {@link Evaluation}.
 */
export function launchDarklyProvider(opts: LaunchDarklyProviderOptions): FlagProvider {
  let client: LDClient | undefined = opts.client;
  const timeout = (opts.timeoutMs ?? 5000) / 1000; // LD expects seconds

  return {
    name: "launchdarkly",

    async init(): Promise<void> {
      if (!client) {
        // Computed specifier + structural cast: the SDK is an OPTIONAL dependency
        // imported lazily, so the build doesn't hard-require its types.
        const specifier = "@launchdarkly/node-server-sdk";
        const LaunchDarkly = (await import(/* @vite-ignore */ specifier)) as unknown as LDModule;
        client = LaunchDarkly.init(opts.sdkKey, opts.offline ? { offline: true } : undefined);
      }
      // Wait for the SDK to fetch its initial flag payload (best effort).
      if (client.waitForInitialization) {
        try {
          await client.waitForInitialization({ timeout });
        } catch {
          // Not initialized (network/key/offline) — resolve() will fall back below.
        }
      }
    },

    async resolve(key: string, context: EvaluationContext, fallback?: FlagValue): Promise<Evaluation> {
      const fb = (fallback ?? false) as FlagValue;
      if (!client) {
        // SDK not initialized → serve the caller's fallback.
        return { key, value: fb, reason: "ERROR" };
      }
      try {
        const ld = await client.variationDetail(key, toLDContext(context), fb);
        const reason = mapReason(ld.reason?.kind);
        return {
          key,
          value: ld.value as FlagValue,
          variant: ld.variationIndex === undefined || ld.variationIndex === null ? undefined : String(ld.variationIndex),
          reason,
        };
      } catch {
        return { key, value: fb, reason: "ERROR" };
      }
    },

    async keys(): Promise<string[]> {
      if (!client?.allFlagsState) return [];
      try {
        const state = await client.allFlagsState(toLDContext({}));
        const values = state.allValues?.();
        return values ? Object.keys(values) : [];
      } catch {
        return [];
      }
    },

    onChange(cb: () => void): () => void {
      const c = client;
      if (!c?.on) return () => {};
      const handler = (): void => cb();
      c.on("update", handler);
      return () => void c.off?.("update", handler);
    },

    async close(): Promise<void> {
      await client?.close?.();
    },
  };
}
