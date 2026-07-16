# Feature-flags external backends — Vercel / LaunchDarkly / PostHog / Datadog

Three shapes: a **source** fills local definitions the engine evaluates; a **provider**
delegates evaluation to a remote backend; a **sink** ships exposures out. All are pure
`fetch`, no vendor SDK (except LaunchDarkly, which uses the LD Node SDK).

## `@youneed/feature-flags-vercel` — Edge Config **source**

Pulls flag **definitions** from Vercel Edge Config; the local engine evaluates them
synchronously.
```ts
import { vercelSource } from "@youneed/feature-flags-vercel";
const flags = createFlags(vercelSource({
  connectionString: process.env.EDGE_CONFIG,   // https://edge-config.vercel.com/<id>?token=<token>
  prefix: "flag:",                              // optional: only flag:* items, prefix stripped
}));
await flags.load();                             // async source → fill the snapshot
flags.isEnabled("new-dashboard", { targetingKey: user.id });
```
Options: `connectionString` **or** (`edgeConfigId` + `token`); `prefix`, `pollMs` (30000,
`onChange` poll), `fetch`, `baseUrl`.

## `@youneed/feature-flags-launchdarkly` — remote **evaluator**

Backed by `@launchdarkly/node-server-sdk`. A `FlagProvider`, not a definition source.
```ts
import { FeatureFlags } from "@youneed/feature-flags";
import { launchDarklyProvider } from "@youneed/feature-flags-launchdarkly";

const flags = new FeatureFlags([], { provider: launchDarklyProvider({ sdkKey: "sdk-…" }) });
await flags.evaluateAsync("new-dashboard", { targetingKey: user.id });   // authoritative
flags.isEnabled("new-dashboard", { targetingKey: user.id });             // best-effort until warmed
```
`init()` lazily imports the LD SDK + `waitForInitialization`; `resolve` builds an LD context
`{ kind:"user", key: targetingKey ?? "anonymous", ...attributes }`, calls `variationDetail`,
maps `{ value, variationIndex, reason }` → `Evaluation`. Engine caches per `(key, context)`.

## `@youneed/feature-flags-posthog` — `/decide` remote **evaluator**

Pure `fetch`, no SDK — runs everywhere the engine does.
```ts
import { posthogProvider } from "@youneed/feature-flags-posthog";
const flags = new FeatureFlags([], { provider: posthogProvider({ apiKey: process.env.POSTHOG_KEY! }) });
await flags.evaluateAsync("new-dashboard", { targetingKey: user.id });
await flags.warm({ targetingKey: user.id }, ["new-dashboard", "checkout"]);   // pre-warm sync cache
flags.isEnabled("new-dashboard", { targetingKey: user.id });
```
Options: `apiKey` (public `phc_…`, required), `host` (`https://app.posthog.com`), `fetch`,
`timeoutMs` (5000), `cacheTtlMs` (50).

## `@youneed/feature-flags-datadog` — exposure **sink**

Not a backend — a telemetry sink. Wires `flags.onEvaluation(...)`, buffers each evaluation as
an exposure, batches, POSTs to the Datadog Logs intake.
```ts
import { attachDatadog } from "@youneed/feature-flags-datadog";
const exp = attachDatadog(flags, { apiKey: process.env.DD_API_KEY!, service: "web", env: "production" });
flags.isEnabled("new-dashboard", { targetingKey: user.id });   // → buffered exposure
await exp.stop();                                              // flush + stop timer on shutdown
```
Batch POSTed to `https://http-intake.logs.<site>/api/v2/logs` with a `DD-API-KEY` header;
records tagged `ddsource: "feature-flags"`, `ddtags: env:…,service:…`.

## Choosing

- Flags authored in a **UI / config store** → source (`vercel`) or evaluator (`launchdarkly`,
  `posthog`), depending on whether targeting runs locally or remotely.
- Want **local, deterministic** evaluation + observability → local `createFlags` + `datadog` sink.
- Remote providers need `evaluateAsync` / `warm` for authoritative reads; sync calls are
  best-effort against the warmed cache.
