# @youneed/feature-flags-posthog

A **PostHog provider** for [`@youneed/feature-flags`](../feature-flags) — a
framework-agnostic **remote evaluator** backed by PostHog's `/decide` HTTP API.
No PostHog SDK: it's **pure `fetch`**, so it runs everywhere the engine does
(DOM, SSR, CLI, server). Evaluation is delegated to PostHog; the engine caches
results per context.

```ts
import { FeatureFlags } from "@youneed/feature-flags";
import { posthogProvider } from "@youneed/feature-flags-posthog";

const flags = new FeatureFlags([], {
  provider: posthogProvider({ apiKey: process.env.POSTHOG_KEY! }),
});

// Await the authoritative value from PostHog:
await flags.evaluateAsync("new-dashboard", { targetingKey: user.id });
await flags.evaluateAsync<string>("checkout", {
  targetingKey: user.id,
  attributes: { plan: user.plan },
}); // → { value: "fast", variant: "fast", reason: "TARGETING_MATCH" }

// Or pre-warm a context so the synchronous `evaluate`/`isEnabled` hit the cache:
await flags.warm({ targetingKey: user.id }, ["new-dashboard", "checkout"]);
flags.isEnabled("new-dashboard", { targetingKey: user.id });
```

## `posthogProvider(options)`

Returns a `FlagProvider` you pass to `new FeatureFlags([], { provider })`.

| Option       | Type        | Default                     | Description                                                        |
| ------------ | ----------- | --------------------------- | ------------------------------------------------------------------ |
| `apiKey`     | `string`    | —                           | PostHog **project** API key (the public `phc_…` key). Required.    |
| `host`       | `string`    | `https://app.posthog.com`   | PostHog host (e.g. `https://eu.posthog.com` for EU cloud).         |
| `fetch`      | `FetchLike` | global `fetch`              | Injectable `fetch` (tests / custom agent).                         |
| `timeoutMs`  | `number`    | `5000`                      | Aborts the `/decide` request after this many ms.                   |
| `cacheTtlMs` | `number`    | `50`                        | Memoise the last `/decide` response per context for this many ms.  |

## How it maps

Each `resolve(key, ctx, fallback)` issues one `POST ${host}/decide?v=3` with:

```json
{ "api_key": "…", "distinct_id": "<ctx.targetingKey ?? 'anonymous'>", "person_properties": { … } }
```

and maps the returned `featureFlags[key]`:

- **string** → a multivariate variant: `{ value, variant: value, reason: "TARGETING_MATCH" }`.
- **boolean** → `{ value, reason: value ? "TARGETING_MATCH" : "DEFAULT" }`.
- **missing** → `fallback ?? false`.

Resolving many keys for the **same context** makes a **single** HTTP call: the
provider memoises the `/decide` response per `distinct_id + person_properties`
for `cacheTtlMs`. `keys()` returns the flag keys from the last `/decide`
response (empty until the first `resolve`); `close()` is a no-op (stateless).

## Test

```sh
pnpm --filter @youneed/feature-flags-posthog test
```

The suite injects a fake `fetch` returning a canned `/decide` body — **no
network** is touched.
