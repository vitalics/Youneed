# @youneed/server-middleware-trace

[W3C Trace Context](https://www.w3.org/TR/trace-context/) distributed tracing for
`@youneed/server`. Dependency-free and OpenTelemetry-compatible (16-byte trace id /
8-byte span id, lowercase hex) — **without** pulling in the OTel SDK. Parses an
incoming `traceparent`, starts a span, propagates a `traceparent` response header,
and hands the finished span to your exporter via `onEnd`.

```ts
import { Application, Response } from "@youneed/server";
import { tracing, span } from "@youneed/server-middleware-trace";

const app = Application()
  .use(tracing({ onEnd: (s) => exporter.push(s) }))   // → traceparent: 00-<traceId>-<spanId>-01
  .get("/users", (ctx) => {
    span(ctx).setAttribute("user.count", 3);
    span(ctx).addEvent("queried-db");
    return Response.json([/* … */]);
  });
```

The exported framework symbol `trace` is a request-scoped log line — this middleware
is `tracing()` and the accessor is `span()` to avoid the clash.

## API

- **`tracing(opts?)`** — middleware. For each request: reuses an incoming
  `traceparent`'s trace id (continuing the upstream trace, its `parent-id` becoming
  this span's parent) or starts a fresh trace id; mints a new span id; stores the
  {@link Span} on `ctx.state.span`. Options:
  - `responseHeader` — emit the `traceparent` response header (default `true`).
  - `onEnd(span)` — called in a `finally` with the finished span (duration recorded).
    The integration hook: export to OpenTelemetry / Jaeger / Zipkin, log it, etc.

  The span `name` is set to `"<METHOD> <path>"` (path without query — low cardinality).

- **`span(ctx)`** — the per-request {@link Span} (a no-op span when the middleware
  isn't installed):
  - `traceId` / `spanId` / `parentId?` — W3C/OTel ids (lowercase hex).
  - `name`, `startTime`, `endTime?`, `duration?`.
  - `attributes`, `events` — OTel-style bags.
  - `setAttribute(key, value)` / `addEvent(name)` — chainable.
  - `end()` — stamp `endTime`/`duration` (idempotent; the middleware calls it).
