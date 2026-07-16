# @youneed/feature-flags-datadog

A **framework-agnostic** adapter for [`@youneed/feature-flags`](../feature-flags)
that ships flag **exposures** to **Datadog**. Datadog is not a flag backend — it
is a telemetry sink. The engine fires a listener for **every** evaluation
(`flags.onEvaluation(listener)`); this adapter buffers each evaluation as an
exposure record, **batches** them, and POSTs the batch to the **Datadog Logs
intake** — no Datadog SDK, plain `fetch`.

```ts
import { createFlags } from "@youneed/feature-flags";
import { attachDatadog } from "@youneed/feature-flags-datadog";

const flags = createFlags([
  { key: "new-dashboard", defaultValue: false, rollout: 20 },
]);

// one call wires flags.onEvaluation(...) up for you:
const exp = attachDatadog(flags, {
  apiKey: process.env.DD_API_KEY!,
  service: "web",
  env: "production",
});

flags.isEnabled("new-dashboard", { targetingKey: user.id }); // → buffered exposure

// on shutdown, flush and stop the timer:
await exp.stop();
```

## What gets shipped

Each evaluation buffers one exposure record and the batch is POSTed as a JSON
array to `https://http-intake.logs.<site>/api/v2/logs` with a `DD-API-KEY`
header. A record looks like:

```json
{
  "ddsource": "feature-flags",
  "ddtags": "env:production,service:web",
  "service": "web",
  "message": "flag new-dashboard=true (ROLLOUT)",
  "flag": "new-dashboard",
  "value": true,
  "variant": null,
  "reason": "ROLLOUT",
  "targetingKey": "user-42",
  "timestamp": 1719830400000
}
```

## API

### `attachDatadog(flags, opts)` → `DatadogExposures`

Builds an exporter **and** calls `flags.onEvaluation(exp.listener)` — the
one-liner most callers want.

### `datadogExposures(opts)` → `DatadogExposures`

Builds the exporter without attaching. Pass `exp.listener` to
`flags.onEvaluation(...)` yourself. Returns:

- **`listener`** — the `EvaluationListener` to register.
- **`flush()`** — ship the buffered exposures now (no-op when empty).
- **`stop()`** — stop the flush timer and flush anything buffered.
- **`stats()`** — `{ url, queued, batches, sent, failed, lastError }`.

### Options

| option      | default            | meaning                                                              |
| ----------- | ------------------ | -------------------------------------------------------------------- |
| `apiKey`    | —                  | Datadog API key, sent as the `DD-API-KEY` header.                    |
| `site`      | `"datadoghq.com"`  | Datadog site/region (`datadoghq.eu`, `us3.datadoghq.com`, …).        |
| `service`   | —                  | `service` tag / `ddtags` `service:`.                                 |
| `env`       | —                  | `ddtags` `env:`.                                                     |
| `source`    | `"feature-flags"`  | log `ddsource`.                                                      |
| `batchSize` | `50`               | flush when this many exposures are buffered.                         |
| `flushMs`   | `5000`             | periodic flush interval (ms); `0` disables the timer.                |
| `timeoutMs` | `10000`            | per-flush request timeout (ms).                                      |
| `dedup`     | `true`             | collapse identical `(flag,value,variant,targetingKey)` in a window (adds `count`). |
| `fetch`     | global `fetch`     | injectable `fetch` (tests).                                          |

The buffer auto-flushes at `batchSize` and on the `flushMs` timer (the timer is
`unref`'d so it never keeps the process alive). Non-2xx responses and network
errors are counted in `stats().failed` / `stats().lastError` — the sink never
throws into your evaluation path.

## Batching design

The exporter mirrors [`@youneed/server-plugin-otlp`](../server-plugin-otlp):
buffer + `flushMs` timer + auto-flush at `batchSize`, injectable `fetch`, and
`sent`/`failed`/`lastError`/`queued` counts.
