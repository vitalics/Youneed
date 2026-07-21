# @youneed/test-plugin-otel

## 0.2.0

### Minor Changes

- d16e110: New packages: OpenTelemetry integration (real OTel SDK) across all framework levels. `@youneed/otel` is the shared core — env-aware config (`OTEL_*` env vars), Node (`startNodeOtel`) and Web (`startWebOtel`) SDK wiring with OTLP/HTTP trace + metric export, W3C `traceparent` propagation helpers and an `instrumentedFetch` for client spans (plugs straight into `@youneed/http-client`). On top of it: `@youneed/server-plugin-otel` (SERVER span per request with remote-parent extraction, `http.server.*` metrics, `ctx.state.span` facade for logger correlation), `@youneed/cli-plugin-otel` (span + metrics per command, flushed before exit), `@youneed/dom-provider-otel` (render/effect/event spans in the browser, flush on pagehide), `@youneed/test-plugin-otel` (a span per test with steps and failure status, `test.*` metrics) and `@youneed/logger-plugin-otel` (`trace_id`/`span_id`/`trace_flags` stamped on every log record). The zero-dep `@youneed/server-middleware-trace` + `@youneed/server-plugin-otlp` remain as the SDK-free alternative.
- d16e110: Provider-level OTEL on every framework level. `@youneed/otel` gains `createOtelApi()` — the shared contributed surface (`span`/`spanAsync` child spans + `counter`/`histogram` delegating to the process-wide global metrics). New integrations: server `otelProvider()` (a `ControllerProvider` giving controllers a typed `this.otel` with per-request `traceId`/`spanId` read from the ambient request, working for HTTP handlers and WS JSON-RPC alike), test `OtelFixture` (`@Test.use(OtelFixture)` or `otel = OtelFixture.get()` — child spans nesting under the test span, process-wide metrics shared across all tests), and the new package `@youneed/ssr-plugin-otel` (`otelModule()` — an `SsrModule` producing `ssr.render <url>` spans + `ssr.render.*` metrics for static page renders, nesting under `@youneed/server-plugin-otel` when present). The cli (`otelCommand`) and dom (`otelProvider`) contributed apis also gain `counter(name)`/`histogram(name)` — additive, no breaking changes.

### Patch Changes

- Updated dependencies [d16e110]
- Updated dependencies [d16e110]
- Updated dependencies [d16e110]
  - @youneed/otel@0.2.0
