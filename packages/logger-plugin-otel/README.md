# @youneed/logger-plugin-otel

OpenTelemetry trace correlation for [`@youneed/logger`](../logger): stamp the
**span active at the moment of each log call** onto every record, using the
shared core [`@youneed/otel`](../otel) (this package never imports
`@opentelemetry/*` directly).

```ts
import { createLogger, format } from "@youneed/logger";
import { otel } from "@youneed/logger-plugin-otel";
import { withSpanAsync } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";

const handle = startNodeOtel({ serviceName: "api" }); // once per process

const log = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  plugins: [otel()], // or later: log.use(otel())
});

await withSpanAsync("GET /users", {}, async () => {
  log.info("listening", { port: 3000 });
  // {"level":"info","message":"listening","timestamp":"…","port":3000,
  //  "trace_id":"4bf92f3577b34da6a3ce929d0e0e4736",
  //  "span_id":"00f067aa0ba902b7","trace_flags":"01"}
});
```

## Fields

Defaults follow the [OTel logs data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/#trace-context-fields):

| field         | value                                             |
| ------------- | ------------------------------------------------- |
| `trace_id`    | 32-hex-char trace id of the active span           |
| `span_id`     | 16-hex-char span id of the active span            |
| `trace_flags` | two-char lowercase hex of the flags (e.g. `"01"`) |

Rename them via `otel({ fields: { traceId, spanId, traceFlags } })`. When no
valid span is active (outside any `withSpan*`, or the SDK is disabled) **nothing
is added** — the record passes through untouched.

## Per-call evaluation

Values are computed **per record**, not at install time. The plugin prepends a
format with `logger.useFormat()` (the framework's per-record injection hook), so
the fields are stamped before your serializing format runs and always reflect
the span that is active when `log.info(...)` executes — unlike
`@youneed/logger-plugin-datadog`, which stamps static defaults.

## Children

`logger.child(meta)` copies the parent's *current* format pipeline, so children
created **after** `log.use(otel())` stamp too; children created **before** the
install keep the old pipeline and do not. Installing the plugin twice on the
same logger is a no-op, and `log.close()` (or the disposer returned by
`install`) restores the original pass-through behavior.

## Coexistence with server-middleware-logger

[`@youneed/server-middleware-logger`](../server-middleware-logger) binds the
correlation id structurally into child loggers as camelCase **`traceId`** (from
`ctx.state.span.traceId`). This plugin instead emits the snake_case OTel
logs-data-model fields `trace_id` / `span_id` / `trace_flags`, evaluated
dynamically from the active OTel context. Both may coexist on the same record —
`traceId` (structural, bound per request) and `trace_id` (dynamic, per log
call) — but prefer one convention per pipeline to avoid confusing your backend.

## Build & test

```sh
pnpm --filter @youneed/logger-plugin-otel run build
pnpm --filter @youneed/logger-plugin-otel test
```
