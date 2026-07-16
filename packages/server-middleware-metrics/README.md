# @youneed/server-middleware-metrics

Record [Prometheus](https://prometheus.io/docs/instrumenting/exposition_formats/)
metrics for every request and expose them at `GET /metrics` in the text exposition
format. Dependency-free — no `prom-client`; the registry and the wire format are
built by hand.

```ts
import { Application, Response } from "@youneed/server";
import { metrics } from "@youneed/server-middleware-metrics";

const app = Application()
  .use(metrics())                              // GET /metrics → text exposition
  .get("/users", () => Response.json([/* … */]));

// → http_requests_total{method="GET",status="200"} 1
//   http_request_duration_seconds_bucket{method="GET",status="200",le="0.05"} 1
//   http_request_duration_seconds_sum{method="GET",status="200"} 0.0012
//   http_request_duration_seconds_count{method="GET",status="200"} 1
//   http_requests_in_flight 0
```

## Metrics

- `http_requests_total` — **counter**, labeled `method` + `status`.
- `http_request_duration_seconds` — **histogram** (`_bucket{le="…"}` / `_sum` /
  `_count`), timed with `performance.now()` around the downstream handler.
- `http_requests_in_flight` — **gauge**.

Series are labeled by `method` + `status` only — never by raw URL/path (that
explodes cardinality).

## API

- **`metrics(opts?)`** — middleware. Serves the exposition at `GET {path}`
  (Content-Type `text/plain; version=0.0.4; charset=utf-8`) and records the three
  metrics above for every other request. Register early so it sees every response.
  Options:
  - `path` — exposition path (default `"/metrics"`).
  - `buckets` — histogram buckets in seconds (default
    `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`).
  - `prefix` — metric-name prefix, e.g. `"myapp_"` → `myapp_http_requests_total`.
  - `route(ctx)` — optional **low-cardinality** route label (e.g. a route
    template). Off by default; only return a bounded set of values, never the raw
    URL.

- **`DEFAULT_BUCKETS`** — the default histogram bucket array.
