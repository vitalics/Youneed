# @youneed/server-plugin-otlp

Export per-request **traces** over **OTLP/HTTP (JSON)** to an OpenTelemetry
collector, Jaeger, Tempo or Grafana — **without the OpenTelemetry SDK**. It
builds on [`@youneed/server-middleware-trace`](../server-middleware-trace), which
already produces OTel-shaped spans per request; this plugin batches them, encodes
`ExportTraceServiceRequest` JSON, and POSTs to `{endpoint}/v1/traces`.

```ts
import { Application } from "@youneed/server";
import { otlp } from "@youneed/server-plugin-otlp";

const app = Application(MyController).plugin(
  otlp({
    endpoint: "http://localhost:4318", // OTLP/HTTP receiver (collector :4318, Tempo, …)
    serviceName: "my-api",
    headers: { "x-honeycomb-team": process.env.HONEYCOMB_KEY! }, // optional auth
    batchSize: 100, // flush when buffered
    flushMs: 5000, // …and on this interval
  }),
);
app.listen(3000);
```

The plugin installs the tracing middleware for you, so every request becomes a
span (`GET /users`, attributes, events, W3C `traceparent` propagation). Enrich a
span from a handler with `span(ctx).setAttribute(...)` / `.addEvent(...)` (from
`@youneed/server-middleware-trace`). Spans batch and ship on the interval, when
the batch fills, and on graceful shutdown (final flush).

## API

- **`otlp(opts)`** — the ServerPlugin. Options: `endpoint`, `tracesPath`
  (default `/v1/traces`), `headers`, `serviceName` (default `"youneed"`),
  `resourceAttributes`, `batchSize` (100), `flushMs` (5000), `timeoutMs` (10000),
  `scopeName`, `recentLimit` (50), `installTracing` (default `true`),
  `exposeDevtools`, `basePath` (`/__otlp`), `fetch` (injectable). Exposes
  `.exporter`.
- **`otlpExporter(opts)` / `new OtlpExporter(opts)`** — the exporter alone.
  `push(span)`, `flush()`, `start()`, `stop()`, `stats()`. Wire it manually with
  `tracing({ onEnd: exporter.push })` and `installTracing: false`.
- **`toOtlpTraces(spans, resource, scope)`** — the pure span → OTLP/HTTP JSON
  encoder (exported for testing / custom pipelines).

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, an
**OTLP** tab (under Infra) shows the endpoint, exported/failed/queued/batch
counts, the last error, a recently-exported-spans table, and a **Flush now**
button. Routes: `GET {basePath}/stats`, `POST {basePath}/flush`.

## Notes

- OTLP/HTTP **JSON** encoding (not protobuf) — accepted by the OTel Collector's
  `otlphttp`/`otlp` receivers and most backends. Trace/span ids are the hex
  strings the tracing middleware already emits; times are converted to
  nanoseconds. Span `kind` is `SERVER`; `status` is `ERROR` for 5xx / `error`
  attributes, else `UNSET`.
- Scope is **traces** today (the gap this fills). Metrics/logs OTLP can layer on
  the same exporter shape later.
