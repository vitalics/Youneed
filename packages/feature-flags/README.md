# @youneed/feature-flags

A tiny, **framework-agnostic** feature-flag engine. Boolean / variant / value
flags, **attribute targeting** + **deterministic percentage rollout**,
**synchronous** evaluation (DOM, SSR, CLI and server all evaluate the same way
without awaiting), and **SSR snapshot hydration**. No external dependencies.

```ts
import { createFlags } from "@youneed/feature-flags";

const flags = createFlags([
  { key: "new-dashboard", defaultValue: false, rollout: 20 },        // 20% of users
  {
    key: "checkout",
    defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }],       // pro users → "fast"
  },
]);

flags.isEnabled("new-dashboard", { targetingKey: user.id });          // stable 20% bucket
flags.variant("checkout", { targetingKey: user.id, attributes: { plan: user.plan } });
flags.value<string>("checkout", { attributes: { plan: "free" } });    // "control"
```

## Model

- **`FlagDefinition`** — `{ key, defaultValue, enabled?, variants?, defaultVariant?, rules?, rollout? }`.
- **`Rule`** — `{ attributes?, percentage?, variant?, value? }`. A rule matches when
  every `attributes` entry equals the context's (an array constraint matches by
  `includes`) **and** the optional `percentage` bucket includes the context.
  First matching rule wins.
- **`EvaluationContext`** — `{ targetingKey?, attributes? }`. `targetingKey` drives
  stable bucketing (the same user always lands in the same rollout bucket).
- **`Evaluation`** — `{ key, value, variant?, reason }` where `reason` is one of
  `TARGETING_MATCH` · `ROLLOUT` · `DEFAULT` · `DISABLED` · `STATIC` · `ERROR`.

## Engine

`createFlags(defs | source)` → `FeatureFlags`:

- `evaluate(key, ctx?)` → full `Evaluation`; `isEnabled` / `variant` / `value(key, ctx?, fallback?)` are shortcuts.
- `all(ctx?)` — evaluate every flag for a context (SSR bootstrap / devtools).
- `override(key, value)` / `override(key, undefined)` — force / clear a value at runtime (dev toggles, tests) — reported as reason `STATIC`.
- `load()` — (re)snapshot definitions from an async `FlagSource`. `onChange(cb)` — react to source/override changes.
- `keys()` / `definition(key)` / `overrides()` — introspection.

## Sources & hydration

- **`MemorySource(defs)`** — in-process, mutable (`set`/`remove` notify → engine reloads). Any `{ all(), onChange? }` is a `FlagSource` (a remote/DB source can plug in).
- **`fromSnapshot(snapshot)`** — rebuild a read-only engine from `flags.all(ctx)` output, preserving value + variant. This is the SSR → client bridge.
- **`bucket(key)`** — the FNV-1a 0–99 bucketer (exported for parity checks).

## Providers — delegate evaluation to a SaaS

Two extension points beyond `FlagSource`:

- **`FlagProvider`** — a REMOTE evaluator the engine delegates to (instead of
  evaluating local defs). `{ name, resolve(key, ctx, fallback?) → Evaluation, keys?, onChange?, init?, close? }`.
  `resolve` may be async; the engine caches results per `(key, context)` so
  `evaluate()` stays synchronous — a cold cache returns the local/fallback value
  and warms in the background (re-render on `onChange`); `await flags.evaluateAsync(key, ctx)`
  and `await flags.warm(ctx)` get the authoritative value. Wire with
  `createFlags([], { provider })`.
- **`onEvaluation(listener)`** — fires for every evaluation; the hook for
  exposure logging / analytics sinks.

Ready-made providers (each its own package):

| Package | Kind | Backend |
| --- | --- | --- |
| `@youneed/feature-flags-vercel` | `FlagSource` | Vercel Edge Config (definitions/values) |
| `@youneed/feature-flags-launchdarkly` | `FlagProvider` | LaunchDarkly server SDK |
| `@youneed/feature-flags-posthog` | `FlagProvider` | PostHog `/decide` API |
| `@youneed/feature-flags-datadog` | `onEvaluation` sink | Datadog exposure logging |

```ts
import { createFlags } from "@youneed/feature-flags";
import { launchDarklyProvider } from "@youneed/feature-flags-launchdarkly";
import { attachDatadog } from "@youneed/feature-flags-datadog";

const flags = createFlags([], { provider: launchDarklyProvider({ sdkKey: process.env.LD_SDK_KEY! }) });
attachDatadog(flags, { apiKey: process.env.DD_API_KEY! }); // log every exposure to Datadog
await flags.warm({ targetingKey: user.id });                // preload for sync reads
```

### A custom provider

Implement whichever contract fits your backend — no base class:

```ts
// definitions the engine evaluates locally:
const source: FlagSource = { async all() { return fetchDefsFromDb(); }, onChange(cb) { return subscribe(cb); } };
createFlags(source);

// OR a remote evaluator the engine delegates to:
const provider: FlagProvider = {
  name: "my-service",
  async resolve(key, ctx, fallback) {
    const v = await myApi.evaluate(key, ctx.targetingKey, ctx.attributes);
    return { key, value: v ?? fallback ?? false, reason: "TARGETING_MATCH" };
  },
};
createFlags([], { provider });

// OR just observe evaluations (telemetry):
flags.onEvaluation((ev, ctx) => track("flag_exposure", { flag: ev.key, value: ev.value, user: ctx.targetingKey }));
```

## Integrations

Layer these on top (each ships its own package):

- **`@youneed/dom-provider-feature-flags`** — `this.flags` in components, reactive re-render on change.
- **`@youneed/server-plugin-feature-flags`** — request-context evaluation, `this.flags` on controllers, bootstrap route + devtools tab.
- **`@youneed/ssr-plugin-feature-flags`** — evaluate on the server, inject the snapshot for client hydration.
- **`@youneed/cli-plugin-feature-flags`** — `this.flags` in commands + a `flags` command.
- **`@youneed/test-plugin-feature-flags`** — set/override flags deterministically in tests.
