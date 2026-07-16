# Observability — OTLP trace export (@youneed/server-plugin-otlp)

Export per-request **traces** over **OTLP/HTTP (JSON)** to an OpenTelemetry collector, Jaeger,
Tempo or Grafana — **without the OpenTelemetry SDK**. Builds on `@youneed/server-middleware-trace`
(which already produces OTel-shaped spans per request); this plugin batches them, encodes an
`ExportTraceServiceRequest`, and POSTs to `{endpoint}/v1/traces`.

```ts
import { Application } from "@youneed/server";
import { otlp } from "@youneed/server-plugin-otlp";

const app = Application(MyController).plugin(otlp({
  endpoint: "http://localhost:4318",                    // OTLP/HTTP receiver (collector :4318, Tempo, …)
  serviceName: "my-api",
  headers: { "x-honeycomb-team": process.env.HONEYCOMB_KEY! },   // optional auth
  batchSize: 100,                                       // flush when buffered
  flushMs: 5000,                                        // …and on this interval
}));
app.listen(3000);
```

The plugin installs the tracing middleware for you, so every request becomes a span
(`GET /users`, attributes, events, W3C `traceparent` propagation). Enrich from a handler with
`span(ctx).setAttribute(...)` / `.addEvent(...)` (from `@youneed/server-middleware-trace`).
Spans batch and ship on the interval, when the batch fills, and on graceful shutdown (final flush).

## API

- **`otlp(opts)`** — the ServerPlugin. Options: `endpoint`, `tracesPath` (default `/v1/traces`),
  `headers`, `serviceName` (default `"youneed"`), `resourceAttributes`, `batchSize` (100),
  `flushMs` (5000), `timeoutMs` (10000), `scopeName`, `recentLimit` (50), `installTracing`
  (default `true`), `exposeDevtools`, `basePath` (`/__otlp`), `fetch` (injectable). Exposes
  `.exporter`.
- **`otlpExporter(opts)` / `new OtlpExporter(opts)`** — the exporter alone: `push(span)`,
  `flush()`, `start()`, `stop()`, `stats()`. Wire manually with `tracing({ onEnd: exporter.push })`
  and `installTracing: false` (e.g. to reuse an existing tracing middleware instance).
- **`toOtlpTraces(spans, resource, scope)`** — the pure span → OTLP/HTTP JSON encoder (exported
  for testing / custom pipelines).

## Devtools

With `@youneed/server-plugin-devtools` mounted, an **OTLP** tab (under Infra) shows the
endpoint and exported/failed/queued/batch counts.

## Relationship to the metrics/trace middleware

`server-middleware-trace` produces the spans and `server-middleware-metrics` exposes Prometheus
metrics (both in the main `youneed` skill's `references/server-security.md`/`server-optimizations.md`
/`plugins-infra.md`). This plugin is only the **exporter** — it does not replace them; it ships
the trace spans onward to an OTel backend.
