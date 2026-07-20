# @youneed/server-plugin-otel

Real **OpenTelemetry SDK** instrumentation for `@youneed/server`, built on the
shared [`@youneed/otel`](../otel) core (the only package that imports
`@opentelemetry/*`). One **SERVER span per request** with W3C `traceparent`
extraction — an incoming trace id continues here, so your service joins an
existing distributed trace — plus `http.server.*` metrics and OTLP/HTTP export.

```ts
import { Application } from "@youneed/server";
import { otel } from "@youneed/server-plugin-otel";

const app = Application(MyController).plugin(
  otel({
    serviceName: "my-api",
    endpoint: "http://localhost:4318", // OTLP/HTTP receiver (collector :4318, Tempo, …)
  }),
);
app.listen(3000);
```

Every request becomes an exported SERVER span (`GET /users`, kind `SERVER`,
attributes `http.request.method` / `url.path` / `http.response.status_code`),
and the span stays **active for the whole pipeline** — any `withSpanAsync` /
`instrumentedFetch` from [`@youneed/otel`](../otel) nests under it
automatically. The SDK flushes and shuts down with the server.

Metrics: histogram `http.server.request.duration` (unit `s`, attributes
`http.request.method`, `http.response.status_code`) and up-down counter
`http.server.active_requests`.

## Middleware-only usage

If the SDK is started elsewhere (custom bootstrap, tests), install just the
middleware — no plugin, no lifecycle:

```ts
import { otelMiddleware } from "@youneed/server-plugin-otel";

app.use(otelMiddleware()); // global OTel providers
app.use(otelMiddleware({ handle })); // a specific startNodeOtel() handle
```

Handlers can reach the live span (and correlation ids) at `ctx.state.span`:

```ts
.get("/users", (ctx) => {
  const span = (ctx.state.span as OtelSpanFacade).otel;
  span.setAttribute("user.count", 3);
  span.addEvent("queried-db");
  return Response.json([/* … */]);
});
```

## `otelProvider()` — typed `this.otel` in controllers

The provider form of the integration, for decorator controllers (mirrors
[`@youneed/server-middleware-logger`](../server-middleware-logger)'s
`loggerProvider`):

```ts
class Users extends Controller("/users", { providers: [otelProvider()] }) {
  @Controller.get("/:id")
  one() {
    // child of the request's SERVER span — no tracer threading
    return this.otel.spanAsync("load-user", async (span) => {
      span.setAttribute("user.id", this.ctx!.params.id);
      this.log.info("loading user", { traceId: this.otel.traceId });
      // …
    });
  }
}
```

`this.otel` is a `ServerOtelApi` — the shared
[`@youneed/otel`](../otel) `OtelApi` plus the current request's ids:

- **`span(name, fn)` / `spanAsync(name, fn)`** — child spans, nested under the
  request's SERVER span automatically (it is active for the whole pipeline);
- **`counter(name)` / `histogram(name)`** — the process-wide global metrics
  (`useGlobalCounter` / `useGlobalHistogram`), shared with every other level;
- **`traceId` / `spanId`** — the current request's SERVER-span ids, resolved
  per access from the ambient request (`context()` → the `ctx.state.span`
  facade the middleware stores).

Like `loggerProvider`, the instance getter reads the **ambient** request via
`context()`, so one memoized api object serves every request — and it degrades
gracefully where there is no HTTP request at all (e.g. a WebSocket JSON-RPC
frame): `traceId`/`spanId` are `undefined` there while spans and metrics keep
working. Options: `{ handle }` (a specific `startNodeOtel()` handle's tracer;
default the global one) and `{ key }` (instance member name, default `"otel"`).
The middleware must still be installed for the SERVER span (and thus the ids)
to exist.

## API

- **`otel(opts?)`** — the ServerPlugin (`name: "otel"`). `opts` extends the
  [`@youneed/otel`](../otel) `NodeOtelConfig` (`serviceName`, `endpoint`,
  `headers`, `resourceAttributes`, `traces`, `metrics`, `sampleRatio`,
  `metricExportIntervalMs`, `enabled`, plus the test hooks `traceExporter` /
  `metricExporter` / `metricReader` / `batch`) with:
  - `handle` — inject an existing `startNodeOtel()` handle; the plugin then
    never flushes/shuts it down (ownership stays with the caller);
  - `installMiddleware` (default `true`) — set `false` to wire
    `otelMiddleware` yourself.
  Exposes `.handle` and `inspect()` → `{ kind: "otel", endpoint }`.
- **`otelMiddleware(opts?)`** — `Middleware`; `{ handle?, tracer? }`, falling
  back to the global `getTracer()` / `getMeter()` providers.
- **`otelProvider(opts?)`** — `ControllerProvider<{ otel: ServerOtelApi }>`;
  `{ handle?, key? }` (default member name `"otel"`). See the section above.
- **`ServerOtelApi`** — `OtelApi` (child spans + global metrics) plus
  `traceId?` / `spanId?` of the current request's SERVER span.
- **`OtelSpanFacade`** — the `ctx.state.span` shape: `{ traceId, spanId, otel }`.

Errors: a thrown error records an exception event + `ERROR` status and is
rethrown (the framework turns it into a response); a non-thrown 5xx result sets
`ERROR` without an exception event.

## Compatibility

- The middleware stores `{ traceId, spanId, otel }` at `ctx.state.span` — the
  same bag [`@youneed/server-middleware-logger`](../server-middleware-logger)
  and [`-request-logger`](../server-middleware-request-logger) read
  structurally, so log correlation (`traceId` on every line) keeps working.
  All-zero (unsampled) ids are skipped by those packages, as before.
- The zero-dependency alternative —
  [`@youneed/server-middleware-trace`](../server-middleware-trace) +
  [`@youneed/server-plugin-otlp`](../server-plugin-otlp) — remains valid when
  you don't want the OTel SDK in the process; it produces OTel-shaped spans and
  ships them as OTLP/HTTP JSON without any `@opentelemetry/*` dependency. Don't
  run both tracing middlewares on the same app (they share the `ctx.state.span`
  slot).

Env vars honored by the underlying SDK setup: `OTEL_SDK_DISABLED`,
`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`.
