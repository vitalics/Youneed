// ── @youneed/feature-flags-posthog — PostHog remote evaluator ────────────────
//
// A framework-agnostic `FlagProvider` for `@youneed/feature-flags`, backed by
// PostHog's `/decide` HTTP API. No SDK — pure `fetch`, so it works everywhere
// (DOM, SSR, CLI, server). Plug it into the engine and evaluation is delegated
// to PostHog:
//
//   import { FeatureFlags } from "@youneed/feature-flags";
//   import { posthogProvider } from "@youneed/feature-flags-posthog";
//
//   const flags = new FeatureFlags([], {
//     provider: posthogProvider({ apiKey: process.env.POSTHOG_KEY! }),
//   });
//   await flags.evaluateAsync("new-dashboard", { targetingKey: user.id });
//
// https://posthog.com/docs/api/post-only-endpoints#decide

import type { EvaluationContext, Evaluation, FlagProvider, FlagValue } from "@youneed/feature-flags";

/** A `fetch` implementation — the global by default, injectable for tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PosthogProviderOptions {
  /** PostHog project API key (the public `phc_…` key). */
  apiKey: string;
  /** PostHog host. Default `https://app.posthog.com`. */
  host?: string;
  /** Injectable `fetch` (tests / custom agent). Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Abort the `/decide` request after this many ms (default 5000). */
  timeoutMs?: number;
  /** Memoise the last `/decide` response per distinct_id+properties for this many
   *  ms so resolving many keys for one context makes a single HTTP call. Default 50. */
  cacheTtlMs?: number;
}

/** The subset of the `/decide?v=3` response we consume. */
interface DecideResponse {
  featureFlags?: Record<string, boolean | string>;
  featureFlagPayloads?: Record<string, unknown>;
}

interface CacheEntry {
  at: number;
  decide: Promise<DecideResponse>;
}

const stableStringify = (v: Record<string, unknown>): string =>
  JSON.stringify(v, Object.keys(v).sort());

/**
 * Create a {@link FlagProvider} that resolves flags via PostHog's `/decide` API.
 * Each `resolve` POSTs the context to `/decide?v=3` and maps the returned
 * `featureFlags[key]`: a string → a multivariate `variant`, a boolean → on/off.
 */
export function posthogProvider(opts: PosthogProviderOptions): FlagProvider {
  const host = (opts.host ?? "https://app.posthog.com").replace(/\/+$/, "");
  const endpoint = `${host}/decide?v=3`;
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 5000;
  const cacheTtlMs = opts.cacheTtlMs ?? 50;

  // Short-TTL memo: one /decide call warms every key for the same context.
  const cache = new Map<string, CacheEntry>();
  // Keys seen in the last decide response — best-effort for `keys()`.
  let lastKeys: string[] = [];

  async function decide(ctx: EvaluationContext): Promise<DecideResponse> {
    const distinctId = ctx.targetingKey ?? "anonymous";
    const personProperties = ctx.attributes ?? {};
    const cacheKey = `${distinctId}|${stableStringify(personProperties as Record<string, unknown>)}`;

    const now = Date.now();
    const hit = cache.get(cacheKey);
    if (hit && now - hit.at < cacheTtlMs) return hit.decide;

    const request = (async (): Promise<DecideResponse> => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: opts.apiKey,
            distinct_id: distinctId,
            person_properties: personProperties,
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          throw new Error(`feature-flags-posthog: /decide ${res.status} ${await res.text().catch(() => "")}`.trim());
        }
        const body = (await res.json()) as DecideResponse;
        if (body.featureFlags) lastKeys = Object.keys(body.featureFlags);
        return body;
      } finally {
        clearTimeout(timer);
      }
    })();

    cache.set(cacheKey, { at: now, decide: request });
    // Drop a failed response from the memo so the next resolve retries.
    request.catch(() => cache.delete(cacheKey));
    return request;
  }

  return {
    name: "posthog",

    async resolve(key: string, ctx: EvaluationContext, fallback?: FlagValue): Promise<Evaluation> {
      const body = await decide(ctx);
      const raw = body.featureFlags?.[key];
      const value: FlagValue = (raw ?? fallback ?? false) as FlagValue;

      // A string result is a multivariate variant.
      if (typeof raw === "string") {
        return { key, value, variant: raw, reason: "TARGETING_MATCH" };
      }
      // Boolean (or the fallback): on → TARGETING_MATCH, off → DEFAULT.
      return { key, value, reason: value ? "TARGETING_MATCH" : "DEFAULT" };
    },

    // /decide can't enumerate keys without a prior call; expose whatever the last
    // response revealed (empty until the first resolve).
    keys(): string[] {
      return [...lastKeys];
    },

    // Stateless fetch — nothing to tear down.
    async close(): Promise<void> {},
  };
}
