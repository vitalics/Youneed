// Run: pnpm --filter @youneed/test-plugin-otel test
// Self-test: drives an INNER TestApplication with the otel plugin against the
// real SDK started on in-memory exporters, then asserts the exported spans,
// span events, stashed trace ids and metrics. The inner run contains one
// intentionally FAILING test — that failure is asserted as data and must NOT
// fail this suite.
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { NoopReporter, Test, TestApplication, expect, type TestContext } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { SpanStatusCode, useGlobalCounter, type OtelApi } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";
import { otel, OtelFixture, type TestOtelMetadata } from "../src/index.ts";

const spans = new InMemorySpanExporter();
const metricsExporter = new InMemoryMetricExporter();

// One SDK start per process — global providers can only be registered once.
// The plugin under test REUSES this handle (injected), so it flushes on
// teardown but never shuts it down; we shut it down ourselves at the bottom.
const handle = startNodeOtel({
  serviceName: "test-plugin-otel-selftest",
  traceExporter: spans,
  metricReader: new PeriodicExportingMetricReader({ exporter: metricsExporter }),
  batch: false, // SimpleSpanProcessor: spans are exported synchronously on end()
});

class OtelPluginSuite extends Test({ name: "@youneed/test-plugin-otel" }) {
  @Test.it("traces each case (status, steps, failure) + stashes trace ids + records metrics")
  async tracesTests() {
    spans.reset();
    metricsExporter.reset();

    // The inner suite under observation: one passing test (with a ctx.step and
    // a child span, like instrumented code under test) + one failing test.
    class Inner extends Test() {
      @Test.it("passes")
      async pass(ctx: TestContext) {
        await ctx.step("arrange", () => {
          const child = handle.tracer.startSpan("child-work"); // must nest under the test span
          child.end();
        });
      }
      @Test.it("fails")
      fail() {
        expect(1).toBe(2); // fails on purpose
      }
    }

    const summary = await TestApplication()
      .addTests(Inner)
      .use(otel({ handle }))
      .reporter(new NoopReporter())
      .run({ setExitCode: false });

    // The inner failure is EXPECTED — asserted here as plain data.
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);

    // ── spans: one per case, named `test <Suite>.<name>` ─────────────────────
    const finished = spans.getFinishedSpans();
    const testSpans = finished.filter((s) => s.name.startsWith("test "));
    expect(testSpans).toHaveLength(2);
    const passSpan = testSpans.find((s) => s.name === "test Inner.passes")!;
    const failSpan = testSpans.find((s) => s.name === "test Inner.fails")!;
    expect(passSpan).toBeTruthy();
    expect(failSpan).toBeTruthy();

    // ── passing span: attrs + UNSET status + step event + nested child span ──
    expect(passSpan.attributes["test.suite"]).toBe("Inner");
    expect(passSpan.attributes["test.name"]).toBe("passes");
    expect(passSpan.attributes["test.status"]).toBe("passed");
    expect(passSpan.status.code).toBe(SpanStatusCode.UNSET);

    const stepEvent = passSpan.events.find((e) => e.name === "step")!;
    expect(stepEvent).toBeTruthy();
    expect(stepEvent.attributes?.["step.name"]).toBe("arrange");
    expect(typeof stepEvent.attributes?.["step.durationMs"]).toBe("number");

    const child = finished.find((s) => s.name === "child-work")!;
    expect(child).toBeTruthy();
    expect(child.parentSpanContext?.traceId).toBe(passSpan.spanContext().traceId);
    expect(child.parentSpanContext?.spanId).toBe(passSpan.spanContext().spanId);

    // ── failing span: ERROR status + exception event + test.status=failed ────
    expect(failSpan.attributes["test.status"]).toBe("failed");
    expect(failSpan.status.code).toBe(SpanStatusCode.ERROR);
    expect(failSpan.events.some((e) => e.name === "exception")).toBe(true);

    // ── metadata: { traceId, spanId } stashed on the inner TestResults ───────
    const metaOf = (name: string) => summary.results.find((r) => r.name === name)!.metadata?.otel as TestOtelMetadata;
    expect(metaOf("passes").traceId).toBe(passSpan.spanContext().traceId);
    expect(metaOf("passes").spanId).toBe(passSpan.spanContext().spanId);
    expect(metaOf("fails").traceId).toBe(failSpan.spanContext().traceId);
    // blob reporter serializes results — the stash must survive a JSON round-trip
    expect(JSON.parse(JSON.stringify(metaOf("passes")))).toEqual(metaOf("passes"));

    // ── metrics: test.results counter (passed + failed) + test.duration ──────
    await handle.forceFlush(); // plugin teardown already flushed; make it explicit
    const allMetrics = metricsExporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics);
    const counter = allMetrics.find((m) => m.descriptor.name === "test.results")!;
    expect(counter).toBeTruthy();
    const statuses = counter.dataPoints.map((dp) => dp.attributes?.status);
    expect(statuses).toContain("passed");
    expect(statuses).toContain("failed");

    const durationMetric = allMetrics.find((m) => m.descriptor.name === "test.duration")!;
    expect(durationMetric).toBeTruthy();
    expect(durationMetric.descriptor.unit).toBe("ms");
    expect(durationMetric.dataPoints.length).toBeGreaterThan(0);
  }

  @Test.it("OtelFixture: decorator + field-marker injection, nesting under the test span, global-metric identity")
  async otelFixture() {
    spans.reset();
    metricsExporter.reset();

    // Captured from inside the inner tests, asserted here as plain data.
    let counterIdentity: boolean | undefined;

    // Decorator injection: `@Test.use(OtelFixture)`.
    class Decorated extends Test() {
      @Test.use(OtelFixture) otel!: OtelApi;

      @Test.it("uses the decorator form")
      decorated() {
        counterIdentity = this.otel.counter("url_calls") === useGlobalCounter("url_calls");
        this.otel.span("step-inner", () => {}); // must nest under the test span
      }
    }

    // Field-marker injection (decorator-free): `otel = OtelFixture.get()`.
    class FieldMarker extends Test() {
      otel = OtelFixture.get();

      @Test.it("uses the field form")
      field() {
        this.otel.span("step-field", () => {}); // must nest under the test span
      }
    }

    const summary = await TestApplication()
      .addTests(Decorated, FieldMarker)
      .use(otel({ handle }))
      .reporter(new NoopReporter())
      .run({ setExitCode: false });

    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(0);

    const finished = spans.getFinishedSpans();

    // ── decorator form: api injected, child span nested under the test span ──
    const decoTestSpan = finished.find((s) => s.name === "test Decorated.uses the decorator form")!;
    expect(decoTestSpan).toBeTruthy();
    const inner = finished.find((s) => s.name === "step-inner")!;
    expect(inner).toBeTruthy();
    expect(inner.parentSpanContext?.traceId).toBe(decoTestSpan.spanContext().traceId);
    expect(inner.parentSpanContext?.spanId).toBe(decoTestSpan.spanContext().spanId);

    // ── the fixture's counter IS the process-wide global counter ─────────────
    expect(counterIdentity).toBe(true);

    // ── field-marker form: same working api without a decorator ──────────────
    const fieldTestSpan = finished.find((s) => s.name === "test FieldMarker.uses the field form")!;
    expect(fieldTestSpan).toBeTruthy();
    const fieldInner = finished.find((s) => s.name === "step-field")!;
    expect(fieldInner).toBeTruthy();
    expect(fieldInner.parentSpanContext?.traceId).toBe(fieldTestSpan.spanContext().traceId);
    expect(fieldInner.parentSpanContext?.spanId).toBe(fieldTestSpan.spanContext().spanId);
  }
}

await TestApplication().addTests(OtelPluginSuite).reporter(new ConsoleReporter()).run();
await handle.shutdown();
