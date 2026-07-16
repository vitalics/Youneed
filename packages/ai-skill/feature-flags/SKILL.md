---
name: youneed-feature-flags
description: "Feature flags in the youneed framework. The framework-agnostic @youneed/feature-flags engine (boolean/variant/value flags, attribute targeting + deterministic percentage rollout by targetingKey, synchronous evaluation across DOM/SSR/CLI/server, SSR snapshot hydration, onEvaluation hook) plus its per-surface integrations — @youneed/server-plugin-feature-flags (request-scoped this.flags + control/bootstrap routes + devtools), @youneed/dom-provider-feature-flags (evaluate in templates, re-render on change), @youneed/ssr-plugin-feature-flags (server-evaluate + inject snapshot into <head> so the client hydrates identical values), @youneed/cli-plugin-feature-flags (flags command + this.flags in commands), @youneed/test-plugin-feature-flags (fresh engine per test, withFlags/expectFlag) — and remote/source adapters @youneed/feature-flags-vercel (Edge Config source), -launchdarkly (remote evaluator), -posthog (/decide evaluator), -datadog (exposure telemetry sink). Use this skill when defining flags, targeting/rollout rules, gating server routes, UI, or CLI commands on a flag, hydrating flags into SSR, testing flagged code, or connecting an external flag backend."
license: ISC
---

# youneed — Feature Flags

One framework-agnostic engine evaluated **identically and synchronously** on every surface
(DOM, SSR, CLI, server), with a snapshot that hydrates the client so there is no flash of
wrong content. Integrations add a scoped `this.flags`; adapters point the engine at an
external backend.

Source of truth: `packages/feature-flags/src`, `packages/{server-plugin,dom-provider,
ssr-plugin,cli-plugin,test-plugin}-feature-flags/src`, `packages/feature-flags-{vercel,
launchdarkly,posthog,datadog}/src`. Verify a signature before asserting it.

## Route to the reference

| Task | Read |
|------|------|
| Flag model, rules, targeting, rollout, `isEnabled`/`variant`/`value`, sources, `onEvaluation` | `references/core.md` |
| Wiring into server / DOM / SSR / CLI / tests (scoped `this.flags`, hydration, fixtures) | `references/integrations.md` |
| External backends — Vercel Edge Config, LaunchDarkly, PostHog, Datadog exposures | `references/providers.md` |

## At a glance

```ts
import { createFlags } from "@youneed/feature-flags";

const flags = createFlags([
  { key: "new-dashboard", defaultValue: false, rollout: 20 },       // stable 20% bucket
  { key: "checkout", defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },    // pro users → "fast"
]);

flags.isEnabled("new-dashboard", { targetingKey: user.id });        // deterministic per user
flags.variant("checkout", { targetingKey: user.id, attributes: { plan: user.plan } });
```

## Key ideas

- **Synchronous, deterministic.** `targetingKey` buckets a user into the same rollout slot
  every time; server, SSR, DOM and CLI all evaluate the same way — no awaiting on the hot path.
- **Scoped `this.flags`.** Each integration derives an `EvaluationContext` from its surface
  (the request's user, the CLI run, …) so checks never thread context by hand.
- **Snapshot hydration.** The SSR module server-evaluates and embeds the result in `<head>`;
  the client hydrates identical values — no flag definitions shipped to the browser.
- **Local defs vs remote evaluator.** A **source** (`vercelSource`) fills local definitions
  the engine evaluates itself; a **provider** (`launchDarklyProvider` / `posthogProvider`)
  delegates evaluation to a remote backend and caches per `(key, context)` so `evaluate`
  stays synchronous. Datadog is neither — it's an **exposure sink** via `onEvaluation`.
- **Deterministic tests.** Fixtures hand every test a fresh engine (overrides wiped) so a
  flag flipped in one case never leaks into the next.

## Ground rules

- Always pass a `targetingKey` for rollout flags, or bucketing is meaningless.
- For remote providers, `await flags.evaluateAsync(...)` (or `flags.warm(ctx, keys)`) when you
  need the authoritative value; synchronous `isEnabled` is best-effort until the cache warms.
- `createFlags(defs)` for local; `new FeatureFlags([], { provider })` for a remote evaluator;
  async sources need `await flags.load()` before the first synchronous read.
