# @youneed/otel

Shared OpenTelemetry setup for all `@youneed/*` framework levels — the **real OTel SDK**, owned in one place so level packages never import `@opentelemetry/*` directly.

- **Node** (`@youneed/otel/node`): `startNodeOtel()` — `NodeTracerProvider` + `BatchSpanProcessor` → OTLP/HTTP, `MeterProvider` + `PeriodicExportingMetricReader` → OTLP/HTTP, W3C + baggage propagators, AsyncLocalStorage context. Used by the server, cli and test levels.
- **Web** (`@youneed/otel/web`): `startWebOtel()` — `WebTracerProvider`, same exporters (browser-safe), force-flush on `pagehide` / tab hidden. Used by the dom level.
- **Env-agnostic core** (`@youneed/otel`): config resolution, span helpers, propagation, `instrumentedFetch`.

## Quick start

```ts
import { startNodeOtel } from "@youneed/otel/node";

const handle = startNodeOtel({ serviceName: "api", endpoint: "http://localhost:4318" });
// …app runs…
await handle.shutdown(); // force-flushes spans + metrics
```

Standard env vars are honored as defaults: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SDK_DISABLED`.

`start*Otel` is a **singleton per process** (global providers register once); a second call warns and returns the existing handle.

## Helpers

| Export | What it does |
| --- | --- |
| `getTracer(scope?)` / `getMeter(scope?)` | Global tracer/meter access |
| `withSpan(name, attrs, fn)` / `withSpanAsync(...)` | Run `fn` in an active span; exceptions recorded + `ERROR` status, span always ends |
| `recordException(span, err)` | Exception event that tolerates non-`Error` throws |
| `injectHeaders(headers?)` / `extractHeaders(headers)` | W3C `traceparent`/`tracestate`/`baggage` propagation for plain header records |
| `instrumentedFetch({ base?, tracer?, spanName? })` | `fetch` wrapper: CLIENT span per call + header injection. Plug into `@youneed/http-client`: `createClient({ fetch: instrumentedFetch() })` |
| `useGlobalCounter(name, opts?)` / `useGlobalHistogram(name, opts?)` | Process-wide shared instruments: the same (scope, name, unit) always yields the SAME counter/histogram — declare once at module top and reuse from app code and every test. Created lazily on first use after the SDK starts; a silent no-op before |
| `createOtelApi({ tracer? })` | The shared `this.otel` surface (`span`/`spanAsync` child spans + `counter`/`histogram` globals) that level packages contribute — server `otelProvider`, dom `otelProvider`, cli `otelCommand`, test `OtelFixture` |
| `activeSpanContext()` / `isValidSpanContext(sc)` | Active span inspection (used by `@youneed/logger-plugin-otel`) |
| `setSpanOnContext(ctx, span)` / `withContext(ctx, fn)` | Explicit context plumbing without importing the api |
| `resolveConfig(config)` / `buildResource(config)` | Config/env merge and OTel `Resource` construction |
| `noopHandle()` | Pass-through `OtelHandle` for the disabled case |

## Test hooks

`startNodeOtel` / `startWebOtel` accept exporter overrides so tests run without a collector:

```ts
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";

const spans = new InMemorySpanExporter();
const handle = startNodeOtel({ serviceName: "test", traceExporter: spans, batch: false });
// batch: false → SimpleSpanProcessor, spans export synchronously on end()
```

`metricExporter` / `metricReader` (e.g. `PeriodicExportingMetricReader` + `InMemoryMetricExporter`) do the same for metrics.

## Level packages

`@youneed/server-plugin-otel` · `@youneed/cli-plugin-otel` · `@youneed/dom-provider-otel` · `@youneed/test-plugin-otel` · `@youneed/logger-plugin-otel` — each wires this core into its framework level. Prefer those over calling `start*Otel` yourself.

Zero-dep alternative (no OTel SDK): `@youneed/server-middleware-trace` + `@youneed/server-plugin-otlp` (server level only).

## Build & test

```sh
pnpm --filter @youneed/otel run build
pnpm --filter @youneed/otel test
```
