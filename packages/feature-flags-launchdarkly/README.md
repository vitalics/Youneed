# @youneed/feature-flags-launchdarkly

[LaunchDarkly](https://launchdarkly.com) provider adapter for
[`@youneed/feature-flags`](../feature-flags), backed by the
[`@launchdarkly/node-server-sdk`](https://github.com/launchdarkly/node-server-sdk-common).
Point the engine at LaunchDarkly and evaluate with the same API — the adapter is
a **remote evaluator** (`FlagProvider`), not a local definition source.

```ts
import { FeatureFlags } from "@youneed/feature-flags";
import { launchDarklyProvider } from "@youneed/feature-flags-launchdarkly";

const flags = new FeatureFlags([], {
  provider: launchDarklyProvider({ sdkKey: "sdk-…" }),
});

// authoritative (awaits the SDK)
const ev = await flags.evaluateAsync("new-dashboard", { targetingKey: user.id });

// synchronous (best-effort until the provider warms the per-context cache)
flags.isEnabled("new-dashboard", { targetingKey: user.id });
```

The engine caches provider results per `(key, context)` so `evaluate()` stays
synchronous, calls `resolve` async in the background, runs `init()` on
construction, and clears the cache on `onChange`. See
[`@youneed/feature-flags`](../feature-flags) for the full engine.

## What it provides

It implements the `FlagProvider` contract from `@youneed/feature-flags`:

- **`init()`** — lazily imports the LD Node server SDK and calls
  `LaunchDarkly.init(sdkKey)` (unless you inject a `client` or set `offline`),
  then `await client.waitForInitialization({ timeout })`.
- **`resolve(key, ctx, fallback)`** — builds an LD context
  `{ kind: "user", key: ctx.targetingKey ?? "anonymous", ...ctx.attributes }`,
  calls `await client.variationDetail(key, ldContext, fallback ?? false)`, and
  maps LD's `{ value, variationIndex, reason }` → our `Evaluation`
  (`variant = String(variationIndex)`). LD reason kinds `FALLTHROUGH` /
  `RULE_MATCH` / `TARGET_MATCH` map to `"TARGETING_MATCH"`, everything else to
  `"DEFAULT"` (`ERROR` → `"ERROR"`). If the SDK isn't initialized, it serves the
  `fallback` with reason `"ERROR"`.
- **`keys()`** — from `client.allFlagsState(ctx).allValues()` keys, or `[]`.
- **`onChange(cb)`** — subscribes to the SDK's `"update"` flag-change event and
  returns an unsubscribe.
- **`close()`** — `client.close()`.

## Options

```ts
launchDarklyProvider({
  sdkKey: "sdk-…",   // required LaunchDarkly server SDK key
  client,            // inject a pre-built / fake client (tests) — skips the SDK import
  timeoutMs: 5000,   // waitForInitialization timeout (passed to LD as seconds)
  offline: false,    // run the SDK offline (served defaults, no streaming)
});
```

`@launchdarkly/node-server-sdk` is an **optional dependency**, imported *lazily*
on `init()` and typed structurally — so builds and tests (which inject a fake
`client`) never hard-require the SDK or hit the network.

## Testing

The test suite (`tests/provider.test.ts`) injects a fake LD client implementing
`variationDetail` / `allFlagsState` / `on` / `close`, so it runs **without** the
real SDK:

```bash
pnpm --filter @youneed/feature-flags-launchdarkly test
```
