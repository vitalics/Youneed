---
"@youneed/otel": minor
"@youneed/server-plugin-otel": minor
"@youneed/cli-plugin-otel": minor
"@youneed/dom-provider-otel": minor
"@youneed/test-plugin-otel": minor
"@youneed/logger-plugin-otel": minor
---

New packages: OpenTelemetry integration (real OTel SDK) across all framework levels. `@youneed/otel` is the shared core — env-aware config (`OTEL_*` env vars), Node (`startNodeOtel`) and Web (`startWebOtel`) SDK wiring with OTLP/HTTP trace + metric export, W3C `traceparent` propagation helpers and an `instrumentedFetch` for client spans (plugs straight into `@youneed/http-client`). On top of it: `@youneed/server-plugin-otel` (SERVER span per request with remote-parent extraction, `http.server.*` metrics, `ctx.state.span` facade for logger correlation), `@youneed/cli-plugin-otel` (span + metrics per command, flushed before exit), `@youneed/dom-provider-otel` (render/effect/event spans in the browser, flush on pagehide), `@youneed/test-plugin-otel` (a span per test with steps and failure status, `test.*` metrics) and `@youneed/logger-plugin-otel` (`trace_id`/`span_id`/`trace_flags` stamped on every log record). The zero-dep `@youneed/server-middleware-trace` + `@youneed/server-plugin-otlp` remain as the SDK-free alternative.
