// ── @youneed/test-plugin-otel — OpenTelemetry tracing + metrics for test runs ─
//
//   import { TestApplication, Test } from "@youneed/test";
//   import { otel } from "@youneed/test-plugin-otel";
//
//   class Api extends Test() {
//     @Test.it("lists users") async users() { /* … */ }
//   }
//
//   TestApplication().addTests(Api)
//     .use(otel({ serviceName: "my-tests", endpoint: "http://localhost:4318" }))
//     .run();
//
// A typed OTEL api is also injectable into test classes via OtelFixture —
//
//   class S extends Test() {
//     @Test.use(OtelFixture) otel!: OtelApi;
//     @Test.it("x") t() { this.otel.counter("url_calls").add(1); }
//   }
//
// Every test case becomes ONE span (`test <Suite>.<name>`) that wraps the body,
// so code under test that is itself instrumented (via @youneed/otel) nests UNDER
// the test span. A failure records an exception event + ERROR status and is
// re-thrown (the runner still fails the test). `ctx.step(...)` timings are
// appended as span events, and the span's { traceId, spanId } is stashed on
// `TestResult.metadata.otel` (blob-safe) so HTML/blob reports can deep-link into
// the tracing backend. Two metrics ride along — a `test.duration` histogram and
// a `test.results` counter, both attributed by { suite, status } — exported
// OTLP/HTTP and flushed on teardown.
//
// The real SDK comes from @youneed/otel (`startNodeOtel`, a per-process
// singleton). Pass `handle` to share an already-started SDK with the code under
// test — the plugin then flushes but never shuts it down (you own the lifecycle).

import {
  createOtelApi,
  isValidSpanContext,
  recordException,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Counter,
  type Histogram,
  type OtelApi,
  type OtelHandle,
  type Span,
} from "@youneed/otel";
import { startNodeOtel, type NodeOtelConfig } from "@youneed/otel/node";
import { Fixture, type FixtureClass, type StepResult, type TestExecution, type TestPlugin } from "@youneed/test";

// ── public types ──────────────────────────────────────────────────────────────

/** Options for {@link otel}. All of {@link NodeOtelConfig} (serviceName,
 *  endpoint, headers, sampling, …) plus test-level extras. */
export interface TestOtelOptions extends NodeOtelConfig {
  /** Reuse an already-started SDK (e.g. the one the code under test uses).
   *  When set, the plugin force-flushes on teardown but does NOT shut the SDK
   *  down — the caller owns its lifecycle. */
  handle?: OtelHandle;
  /** Reserved, NOT implemented: suite-level spans are not emitted because the
   *  plugin API exposes no suite boundary — `runTest` wraps isolated cases and
   *  `setup`/`teardown` are run-wide, so a suite span could never be ended
   *  reliably. Setting this warns once and is otherwise ignored (see README). */
  suiteSpans?: boolean;
}

/** Correlation ids stashed on `TestResult.metadata.otel` — plain strings, so
 *  the metadata stays JSON-serializable and survives the blob reporter. */
export interface TestOtelMetadata {
  traceId: string;
  spanId: string;
}

// ── plugin ───────────────────────────────────────────────────────────────────

/**
 * The OpenTelemetry plugin. Register with `TestApplication().use(otel({…}))`.
 * With no `handle` it starts the Node SDK itself (OTLP/HTTP, honoring the
 * standard OTEL_* env vars via @youneed/otel) and shuts it down on teardown.
 */
export function otel(opts: TestOtelOptions = {}): TestPlugin {
  const { handle: injected, suiteSpans, ...config } = opts;
  let handle: OtelHandle;
  let duration: Histogram;
  let results: Counter;

  return {
    name: "otel",

    setup() {
      if (suiteSpans) {
        console.warn(
          "[@youneed/test-plugin-otel] suiteSpans is not supported — the plugin API exposes no suite boundary; option ignored",
        );
      }
      handle = injected ?? startNodeOtel(config);
      duration = handle.meter.createHistogram("test.duration", {
        unit: "ms",
        description: "Test case duration in milliseconds",
      });
      results = handle.meter.createCounter("test.results", {
        description: "Test cases executed, by suite and status",
      });
    },

    async runTest(exec: TestExecution) {
      const suite = exec.ctx.suite || exec.suite.name || "anonymous";
      // startActiveSpan runs the body INSIDE the span's context — instrumented
      // code under test nests under the test span with no extra wiring.
      await handle.tracer.startActiveSpan(
        `test ${suite}.${exec.ctx.name}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: { "test.suite": suite, "test.name": exec.ctx.name },
        },
        async (span) => {
          let status: "passed" | "failed" = "passed";
          const t0 = performance.now();
          try {
            await exec.next();
          } catch (err) {
            status = "failed";
            recordException(span, err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
            throw err; // the runner must still see the failure
          } finally {
            const elapsed = performance.now() - t0;
            span.setAttribute("test.status", status);
            appendSteps(span, exec.ctx.steps);
            const sc = span.spanContext();
            if (isValidSpanContext(sc)) {
              // → TestResult.metadata.otel (blob-safe correlation ids)
              const correlation: TestOtelMetadata = { traceId: sc.traceId, spanId: sc.spanId };
              exec.ctx.metadata.otel = correlation;
            }
            span.end();
            const attrs: Attributes = { suite, status };
            duration.record(elapsed, attrs);
            results.add(1, attrs);
          }
        },
      );
    },

    async teardown() {
      await handle.forceFlush();
      if (!injected) await handle.shutdown(); // only shut down what we started
    },
  };
}

// ── fixture ──────────────────────────────────────────────────────────────────

// The base goes through the exported FixtureClass interface (+ get()) instead of
// extending the `Fixture(...)` call directly: the returned class's static brand
// symbol is module-private in @youneed/test, which would break .d.ts emit here.
const OtelFixtureBase: FixtureClass<OtelApi> & {
  /** Field-initializer injection (decorator-free): `otel = OtelFixture.get()`. */
  get(): OtelApi;
} = Fixture<OtelApi>({ scope: "test", name: "otel" }) as FixtureClass<OtelApi> & { get(): OtelApi };

/**
 * Fixture form of the OTEL integration — injects a typed {@link OtelApi}:
 *
 *   class S extends Test() {
 *     @Test.use(OtelFixture) otel!: OtelApi;   // …or `otel = OtelFixture.get()`
 *     @Test.it("counts calls") t() {
 *       this.otel.counter("url_calls").add(1); // process-wide metric
 *       this.otel.span("load", () => { … });   // nests under the test span
 *     }
 *   }
 *
 * Scope `"test"`: the api is stateless, so a fresh value per test costs nothing
 * and no teardown is needed. Spans created via the api run INSIDE the plugin's
 * per-test span (`test <Suite>.<name>`); `counter()`/`histogram()` delegate to
 * the process-wide global metrics, so they are shared with the code under test
 * and with every other test. Works without the `otel()` plugin too — with no
 * SDK started, spans simply go nowhere. Subclass to customize, e.g. bind a
 * dedicated tracer:
 *
 *   class MyOtel extends OtelFixture {
 *     override setup() { return createOtelApi({ tracer: myTracer }); }
 *   }
 */
export class OtelFixture extends OtelFixtureBase {
  override setup(): OtelApi {
    return createOtelApi(); // global tracer — the plugin's SDK registers it
  }
}

/** Append the (nested) `ctx.step` timings as span events — one "step" event per
 *  step, carrying its name/duration (+ path for nested steps, error if it threw). */
function appendSteps(span: Span, steps: StepResult[], path: string[] = []): void {
  for (const step of steps) {
    const here = [...path, step.name];
    const attributes: Attributes = {
      "step.name": step.name,
      "step.durationMs": step.durationMs,
    };
    if (path.length) attributes["step.path"] = here.join(" > ");
    if (step.error) attributes["step.error"] = step.error;
    span.addEvent("step", attributes);
    if (step.steps.length) appendSteps(span, step.steps, here);
  }
}
