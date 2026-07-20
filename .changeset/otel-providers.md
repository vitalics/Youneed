---
"@youneed/otel": minor
"@youneed/server-plugin-otel": minor
"@youneed/cli-plugin-otel": minor
"@youneed/dom-provider-otel": minor
"@youneed/test-plugin-otel": minor
"@youneed/ssr-plugin-otel": minor
---

Provider-level OTEL on every framework level. `@youneed/otel` gains `createOtelApi()` — the shared contributed surface (`span`/`spanAsync` child spans + `counter`/`histogram` delegating to the process-wide global metrics). New integrations: server `otelProvider()` (a `ControllerProvider` giving controllers a typed `this.otel` with per-request `traceId`/`spanId` read from the ambient request, working for HTTP handlers and WS JSON-RPC alike), test `OtelFixture` (`@Test.use(OtelFixture)` or `otel = OtelFixture.get()` — child spans nesting under the test span, process-wide metrics shared across all tests), and the new package `@youneed/ssr-plugin-otel` (`otelModule()` — an `SsrModule` producing `ssr.render <url>` spans + `ssr.render.*` metrics for static page renders, nesting under `@youneed/server-plugin-otel` when present). The cli (`otelCommand`) and dom (`otelProvider`) contributed apis also gain `counter(name)`/`histogram(name)` — additive, no breaking changes.
