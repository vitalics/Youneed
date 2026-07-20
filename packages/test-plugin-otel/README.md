# @youneed/test-plugin-otel

OpenTelemetry for `@youneed/test` runs — **one span per test case** plus `test.*`
metrics, exported over OTLP/HTTP by the real OTel SDK (via `@youneed/otel`).

## Usage

```ts
import { TestApplication } from "@youneed/test";
import { otel } from "@youneed/test-plugin-otel";

await TestApplication()
  .addTests(MySuite)
  .use(otel({ serviceName: "my-tests", endpoint: "http://localhost:4318" }))
  .run();
```

`otel(opts)` accepts all of `NodeOtelConfig` from `@youneed/otel/node`
(`serviceName`, `endpoint`, `headers`, `resourceAttributes`, `traces`, `metrics`,
`sampleRatio`, `metricExportIntervalMs`, `enabled` — standard `OTEL_*` env vars
are honored as defaults), plus:

| option        | meaning                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `handle`      | Reuse an already-started `OtelHandle`. The plugin then force-flushes on teardown but never shuts the SDK down — you own its lifecycle. |
| `suiteSpans`  | Reserved, **not implemented** — see below. Setting it warns and is ignored.                       |

Without `handle`, the plugin starts the Node SDK itself (`startNodeOtel`) in
`setup` and shuts it down in `teardown` (after a final flush).

## Spans

Each test case produces one span named `test <Suite>.<name>` that wraps the test
body, so any code under test that is itself instrumented (via `@youneed/otel`)
nests **under** the test span in the same trace.

- Attributes: `test.suite`, `test.name`, `test.status` (`"passed" | "failed"`).
- A failing test records an `exception` span event and sets the span status to
  `ERROR` (with the error message) — the error is re-thrown, so the runner still
  fails the test.
- `ctx.step(...)` timings are appended as `step` span events with attributes
  `step.name`, `step.durationMs`, and `step.error` / `step.path` when applicable
  (nested steps are flattened with their full path).

## Metrics

Both attributed by `{ suite, status }`:

- `test.duration` — histogram of test case durations (unit `ms`).
- `test.results` — counter of executed test cases.

## Trace correlation in reports

For every test the plugin stashes the span's correlation ids on the result:

```ts
result.metadata.otel = { traceId, spanId };
```

`TestResult.metadata` is JSON-serialized by the blob reporter and surfaces in
HTML/merged reports — so a report can deep-link each test into Jaeger/Tempo/
Grafana/etc. (`metadata.otel` is omitted when the SDK is disabled and no real
span context exists).

## Sharing the SDK with the code under test

`startNodeOtel` is a per-process singleton. If the system under test already
started OTel (or you start it in a global setup file), pass that handle in:

```ts
const handle = startNodeOtel({ serviceName: "my-tests" });
await TestApplication().addTests(MySuite).use(otel({ handle })).run();
await handle.shutdown(); // yours to shut down, not the plugin's
```

This keeps test spans and application spans in one backend with one resource
identity, and prevents the plugin's teardown from shutting down a shared SDK.

## OtelFixture

`OtelFixture` is the fixture form of the integration — a typed `OtelApi` (from
`@youneed/otel`) injected into test classes, either with a decorator or
decorator-free via a field initializer:

```ts
import { Test } from "@youneed/test";
import { OtelFixture } from "@youneed/test-plugin-otel";
import type { OtelApi } from "@youneed/otel";

class S extends Test() {
  @Test.use(OtelFixture) otel!: OtelApi;
  // otel = OtelFixture.get();   // ← decorator-free alternative

  @Test.it("calls the api")
  async t() {
    this.otel.counter("url_calls").add(1);
    await this.otel.spanAsync("load-users", async () => {
      /* … */
    });
  }
}
```

What the api gives you:

- `span` / `spanAsync` — child spans that nest **under the test span**
  (`test <Suite>.<name>` opened by the plugin's `runTest`), same trace, no
  extra wiring.
- `counter(name)` / `histogram(name)` — the **process-wide** global instruments
  (`useGlobalCounter` / `useGlobalHistogram`): one `url_calls` counter is
  shared by app code under test and by every test in the run, so "url_calls
  across all tests" is a single metric stream, not per-test duplicates.
- `tracer` — the global tracer the plugin's SDK registered.

Scope is `"test"`: a fresh (stateless) api per test, no teardown. It also works
without the `otel()` plugin installed — with no SDK started, spans simply go
nowhere. Subclass to customize (e.g. bind a dedicated tracer):

```ts
class MyOtel extends OtelFixture {
  override setup() {
    return createOtelApi({ tracer: myTracer });
  }
}
```

## Limitations

- **`.parallel(n)` / `workers(n)`**: the plugin still runs (per lane / per
  worker process — each worker starts its own SDK), and spans/metrics are
  exported fine, but the reporter-replay semantics of parallel runs differ from
  a live sequential run (canonical `onTest*` events are buffered and replayed).
  A dedicated `test-reporter-otel` may come later for tighter integration.
- **No suite-level spans** (`suiteSpans`): the plugin API exposes no suite
  boundary — `runTest` wraps individual cases and `setup`/`teardown` are
  run-wide, so a suite span could be opened but never reliably ended. Rather
  than hack it, suite spans are omitted; the option is reserved for a future
  reporter-based implementation (reporters do see `onSuiteStart`/`onSuiteEnd`).

## Development

```sh
pnpm --filter @youneed/test-plugin-otel run build
pnpm --filter @youneed/test-plugin-otel test
```
