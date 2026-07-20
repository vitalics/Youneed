// Run: pnpm --filter @youneed/otel test
// Core helpers + Node SDK wiring with in-memory exporters — no network, no collector.
import { trace } from "@opentelemetry/api";
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import {
  createOtelApi,
  extractHeaders,
  getTracer,
  injectHeaders,
  instrumentedFetch,
  resolveConfig,
  useGlobalCounter,
  useGlobalHistogram,
  withSpan,
  withSpanAsync,
  SpanKind,
  SpanStatusCode,
} from "../src/index.ts";
import { startNodeOtel } from "../src/node.ts";

// Created BEFORE startNodeOtel — proves late binding: the api proxies the
// instrument and attaches it to the real provider once the SDK starts. This is
// the "one global metric shared by all tests" scenario.
const earlyCounter = useGlobalCounter("early_calls");

const spans = new InMemorySpanExporter();
const metricsExporter = new InMemoryMetricExporter();

// One SDK start per process — global providers can only be registered once.
const handle = startNodeOtel({
  serviceName: "otel-core-test",
  traceExporter: spans,
  metricReader: new PeriodicExportingMetricReader({ exporter: metricsExporter }),
  batch: false, // SimpleSpanProcessor: spans are exported synchronously on end()
});

class OtelSuite extends Test({ name: "@youneed/otel" }) {
  @Test.it("resolves config from defaults and env vars") config() {
    const cfg = resolveConfig({ serviceName: "svc" });
    expect(cfg.endpoint).toBe("http://localhost:4318");
    expect(cfg.serviceName).toBe("svc");
    expect(cfg.traces).toBe(true);
    expect(cfg.sampleRatio).toBe(1);

    process.env.OTEL_SERVICE_NAME = "env-svc";
    process.env.OTEL_SDK_DISABLED = "true";
    process.env.OTEL_EXPORTER_OTLP_HEADERS = "authorization=Bearer t, x-a=b";
    const fromEnv = resolveConfig();
    expect(fromEnv.serviceName).toBe("env-svc");
    expect(fromEnv.enabled).toBe(false);
    expect(fromEnv.headers).toEqual({ authorization: "Bearer t", "x-a": "b" });
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SDK_DISABLED;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
  }

  @Test.it("creates spans via withSpanAsync and stamps resource service.name") async spansWork() {
    spans.reset();
    const out = await withSpanAsync("job", { "job.id": 7 }, async (span) => {
      span.setAttribute("job.step", "half");
      return 42;
    });
    expect(out).toBe(42);
    const [span] = spans.getFinishedSpans();
    expect(span.name).toBe("job");
    expect(span.attributes["job.id"]).toBe(7);
    expect(span.attributes["job.step"]).toBe("half");
    expect(span.resource.attributes["service.name"]).toBe("otel-core-test");
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  }

  @Test.it("records exceptions and sets ERROR status on throw") async errors() {
    spans.reset();
    let caught: unknown;
    try {
      await withSpanAsync("boom", {}, async () => {
        throw new Error("kaput");
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toBe("kaput");
    const [span] = spans.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe("kaput");
    expect(span.events.some((e) => e.name === "exception")).toBe(true);
  }

  @Test.it("nests sync withSpan under the active async span") async nesting() {
    spans.reset();
    await withSpanAsync("parent", {}, async () => {
      withSpan("child", {}, () => "ok");
    });
    const [child, parent] = spans.getFinishedSpans();
    expect(child.name).toBe("child");
    expect(parent.name).toBe("parent");
    expect(child.parentSpanContext?.traceId).toBe(parent.spanContext().traceId);
  }

  @Test.it("injects and extracts W3C traceparent headers round-trip") async propagation() {
    spans.reset();
    await withSpanAsync("wire", {}, async (span) => {
      const headers = injectHeaders();
      expect(/^00-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/.test(headers.traceparent)).toBe(true);
      const ctx = extractHeaders({ TraceParent: headers.traceparent });
      const extracted = trace.getSpanContext(ctx);
      expect(extracted?.traceId).toBe(span.spanContext().traceId);
      expect(extracted?.spanId).toBe(span.spanContext().spanId);
      expect(extracted?.isRemote).toBe(true);
    });
  }

  @Test.it("instrumentedFetch creates a CLIENT span and injects traceparent") async fetchSpan() {
    spans.reset();
    const calls: Array<{ headers: Headers }> = [];
    const fake = (async (_input: unknown, init?: { headers?: Headers }) => {
      calls.push({ headers: init!.headers! });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const res = await instrumentedFetch({ base: fake })("http://api.example.com/users");
    expect(res.status).toBe(200);

    const traceparent = calls[0].headers.get("traceparent")!;
    expect(/^00-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/.test(traceparent)).toBe(true);

    const [span] = spans.getFinishedSpans();
    expect(span.name).toBe("HTTP GET");
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.attributes["http.response.status_code"]).toBe(200);
    expect(span.attributes["server.address"]).toBe("api.example.com");
    // the injected traceparent points at the very CLIENT span that was exported
    expect(traceparent.split("-")[1]).toBe(span.spanContext().traceId);
    expect(traceparent.split("-")[2]).toBe(span.spanContext().spanId);
  }

  @Test.it("marks HTTP >= 400 client spans as ERROR") async fetchError() {
    spans.reset();
    const fake = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await instrumentedFetch({ base: fake })("http://x.test/");
    const [span] = spans.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  }

  @Test.it("exports counters through the meter provider") async metricsWork() {
    metricsExporter.reset();
    const counter = handle.meter.createCounter("test.jobs", { description: "jobs done" });
    counter.add(5, { kind: "unit" });
    counter.add(3, { kind: "unit" });
    await handle.forceFlush();
    const [rm] = metricsExporter.getMetrics();
    const metric = rm.scopeMetrics[0].metrics.find((m) => m.descriptor.name === "test.jobs")!;
    const total = metric.dataPoints.reduce((acc, dp) => acc + Number(dp.value), 0);
    expect(total).toBe(8);
  }

  @Test.it("getTracer returns a live tracer from the global provider") liveTracer() {
    spans.reset();
    const span = getTracer("direct").startSpan("direct-span");
    span.end();
    expect(spans.getFinishedSpans()[0].name).toBe("direct-span");
  }

  @Test.it("useGlobalCounter returns the same instrument for the same name") globalIdentity() {
    expect(useGlobalCounter("url_calls")).toBe(useGlobalCounter("url_calls"));
    expect(useGlobalCounter("url_calls", { unit: "ms" }) === useGlobalCounter("url_calls")).toBe(false);
    expect(useGlobalCounter("url_calls", { scope: "other" }) === useGlobalCounter("url_calls")).toBe(false);
    expect((useGlobalHistogram("h1") as unknown) === useGlobalCounter("h1")).toBe(false);
  }

  @Test.it("a counter created before SDK start still records (late binding)") async lateBinding() {
    metricsExporter.reset();
    earlyCounter.add(4, { where: "test" });
    await handle.forceFlush();
    const metric = metricsExporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((m) => m.descriptor.name === "early_calls")!;
    const total = metric.dataPoints.reduce((acc, dp) => acc + Number(dp.value), 0);
    expect(total).toBe(4);
  }

  @Test.it("useGlobalHistogram records observations through the shared instrument") async globalHistogram() {
    metricsExporter.reset();
    useGlobalHistogram("job_seconds", { unit: "s", description: "job duration" }).record(0.25, { job: "x" });
    await handle.forceFlush();
    const metric = metricsExporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((m) => m.descriptor.name === "job_seconds")!;
    expect(metric.descriptor.unit).toBe("s");
    expect(metric.dataPoints.length).toBe(1);
  }

  @Test.it("createOtelApi spans nest under the active span") async apiSpans() {
    spans.reset();
    const api = createOtelApi();
    await withSpanAsync("outer", {}, async () => {
      api.span("inner-sync", () => "s");
      const v = await api.spanAsync("inner-async", async () => 7);
      expect(v).toBe(7);
    });
    const finished = spans.getFinishedSpans();
    const outer = finished.find((s) => s.name === "outer")!;
    for (const child of finished.filter((s) => s.name !== "outer")) {
      expect(child.spanContext().traceId).toBe(outer.spanContext().traceId);
      expect(child.parentSpanContext?.spanId).toBe(outer.spanContext().spanId);
    }
    expect(finished.length).toBe(3);
  }

  @Test.it("createOtelApi counter/histogram delegate to the global metrics") apiMetrics() {
    const api = createOtelApi();
    expect(api.counter("shared_calls")).toBe(useGlobalCounter("shared_calls"));
    expect(api.histogram("shared_seconds")).toBe(useGlobalHistogram("shared_seconds"));
  }
}

await TestApplication().addTests(OtelSuite).reporter(new ConsoleReporter()).run();
await handle.shutdown();
