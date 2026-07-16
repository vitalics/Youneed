# Feature-flags core — @youneed/feature-flags

Framework-agnostic, dependency-free, **synchronous** flag engine. Boolean / variant / value
flags, attribute targeting + deterministic percentage rollout, SSR snapshot hydration.

```ts
import { createFlags } from "@youneed/feature-flags";

const flags = createFlags([
  { key: "new-dashboard", defaultValue: false, rollout: 20 },        // 20% of users
  { key: "checkout", defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },     // pro → "fast"
]);

flags.isEnabled("new-dashboard", { targetingKey: user.id });          // stable 20% bucket
flags.variant("checkout", { targetingKey: user.id, attributes: { plan: user.plan } });
flags.value<string>("checkout", { attributes: { plan: "free" } });    // "control"
```

## Model

- **`FlagDefinition`** — `{ key, defaultValue, enabled?, variants?, defaultVariant?, rules?, rollout? }`.
- **`Rule`** — `{ attributes?, percentage?, variant?, value? }`. Matches when every
  `attributes` entry equals the context's (an array constraint matches by `includes`) **and**
  the optional `percentage` bucket includes the context. **First matching rule wins.**
- **`EvaluationContext`** — `{ targetingKey?, attributes? }`. `targetingKey` drives stable
  bucketing — the same user always lands in the same rollout bucket.
- **`Evaluation`** — `{ key, value, variant?, reason }`, `reason` ∈ `TARGETING_MATCH` ·
  `ROLLOUT` · `DEFAULT` · `DISABLED` · `STATIC` · `ERROR`.

## Engine — `createFlags(defs | source)` → `FeatureFlags`

- **`isEnabled(key, ctx?)`** — boolean.
- **`variant(key, ctx?)`** — the chosen variant name.
- **`value<T>(key, ctx?)`** — the resolved value.
- **`all(ctx?)`** — evaluate every flag (used to build the SSR snapshot).
- **`onEvaluation(listener)`** — fires on every evaluation (drives the Datadog exposure sink).
- **Async source / remote provider:** `load()` (fill snapshot from an async source),
  `evaluateAsync(key, ctx)` (authoritative value), `warm(ctx, keys)` (pre-fill the sync cache).

## Construction shapes

```ts
createFlags(defs)                                  // local definitions, sync
createFlags(vercelSource({...})); await load()     // async source → local defs
new FeatureFlags([], { provider })                 // remote evaluator (LaunchDarkly/PostHog)
```

## Overrides

Runtime `override(key, value)` forces a value (dev toggles, tests); `onChange` fires so
subscribers (DOM re-render, cleared caches) react. See `integrations.md` for per-surface
override UIs (the CLI `flags` command, the server dev toggles, the test fixtures).
