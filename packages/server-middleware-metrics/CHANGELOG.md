# @youneed/server-middleware-metrics

## 0.2.0

### Minor Changes

- d16e110: New global-metrics API on both metrics stacks: `useGlobalCounter(name, opts?)` and `useGlobalHistogram(name, opts?)` return process-wide shared instruments — the same name always yields the same underlying metric, so a metric like `url_calls` can be declared once (e.g. at the top of a test file) and reused by app code, middleware and every test instead of being re-created per test. In `@youneed/otel` the OTEL instrument is created lazily on first use after `startNodeOtel`/`startWebOtel` (the metrics api has no late binding) and stays a no-op without an SDK; in `@youneed/server-middleware-metrics` the series render in every `GET /metrics` exposition next to the built-ins. Also fixes a pre-existing double-counting bug in the Prometheus histogram buckets (per-bucket counts were stored cumulatively AND rendered cumulatively, inflating every `le` above the first) — `http_request_duration_seconds_bucket` values are now correct.
