# @youneed/cli-plugin-otel

OpenTelemetry for `@youneed/cli` — a span per command execution, `cli.command.*`
metrics, and OTLP/HTTP export flushed before the process exits. Built on the
shared core `@youneed/otel` (real OTel SDK); this package never imports
`@opentelemetry/*` directly.

## Wiring

Two halves, used together or separately:

```ts
import { Application, Command } from "@youneed/cli";
import { otelCommand, otelPlugin } from "@youneed/cli-plugin-otel";

class Deploy extends Command({
  name: "deploy <env>",
  middleware: [otelCommand()],          // 1. per-command span + this.otel
}) {
  async execute(env: string) {
    const plan = await this.otel.spanAsync("plan", async () => buildPlan(env));
    await this.otel.spanAsync("apply", async () => applyPlan(plan));
  }
}

Application({
  name: "ops",
  version: "1.4.0",
  commands: [Deploy],
  plugins: [otelPlugin({ serviceName: "ops-cli" })], // 2. SDK lifecycle + metrics
});
```

## What gets traced

**`otelCommand()` middleware** — one span per command run:

- Name `cli.command <name>`, kind `INTERNAL`, opened at middleware install and
  ended at teardown — duration covers install → execute/render → teardown.
- Attributes: `cli.program.name`, `cli.program.version`, `cli.command.name`,
  `cli.command.args` (string array), and `cli.command.error: true` on failure.
- A throw from `execute`/`render` is recorded on the span (exception event +
  `ERROR` status) and rethrown.
- Contributes `this.otel`: `{ tracer, span(name, fn), spanAsync(name, fn) }` —
  child spans nested under the command span, in the same trace. (`span` is
  sync-only; use `spanAsync` for async work.)
- `this.otel.counter(name, opts?)` / `this.otel.histogram(name, opts?)` — the
  process-wide global metrics from `@youneed/otel` (`useGlobalCounter` /
  `useGlobalHistogram`): the same name is one metric shared with app code and
  every test, not re-created per command.

**`otelPlugin(opts)` plugin** — SDK lifecycle + metrics:

- `setup` starts the Node OTel SDK via `startNodeOtel(opts)` — OTLP/HTTP
  traces + metrics, env-aware config. `opts` is the full `NodeOtelConfig`:
  `serviceName`, `endpoint`, `headers`, `resourceAttributes`, `traces`,
  `metrics`, `sampleRatio`, `metricExportIntervalMs`, `enabled`, plus the test
  hooks `traceExporter` / `metricExporter` / `metricReader` / `batch`.
- `afterCommand` records counter `cli.command.count` and histogram
  `cli.command.duration` (ms), both with `{ command, exit_code }` attributes.
- `onError` records the error on the still-open command span if the middleware
  didn't already (deduped).

Standard env vars are honored as defaults: `OTEL_SDK_DISABLED`,
`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_HEADERS`.

## Flush before exit

The runner **awaits** `afterCommand`, so the plugin's `forceFlush()` +
`shutdown()` complete before the process exits — telemetry reliably reaches the
collector even for short-lived commands. This only happens for a handle the
plugin started itself; an injected handle (`otelPlugin({ handle })`, and
`otelCommand({ handle })` for its tracer) is left alone — its owner controls
the lifecycle.

CLIs are short-lived: `batch: false` (SimpleSpanProcessor) exports every span
immediately instead of buffering — the flush at `afterCommand` covers you
either way, so the plugin keeps the SDK default (`batch: true`) unless you say
otherwise.

## Development

```sh
pnpm --filter @youneed/cli-plugin-otel build
pnpm --filter @youneed/cli-plugin-otel test
```
