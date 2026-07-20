// Run: pnpm --filter @youneed/logger-plugin-otel test
// Trace-correlation stamping against the real OTel SDK with in-memory exporters
// — no network, no collector. The SDK is a per-process singleton: start ONCE.
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, createTransport, format, type TransformableInfo } from "@youneed/logger";
import { withSpanAsync } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";
import { otel } from "../src/index.ts";

const handle = startNodeOtel({
  serviceName: "logger-otel-test",
  traceExporter: new InMemorySpanExporter(),
  metricReader: new PeriodicExportingMetricReader({ exporter: new InMemoryMetricExporter() }),
  batch: false, // SimpleSpanProcessor: spans are exported synchronously on end()
});

const capture = (sink: TransformableInfo[]) => createTransport({ log: (i) => sink.push(i) });
class OtelPluginSuite extends Test({ name: "logger-plugin-otel" }) {
  @Test.it("stamps trace_id/span_id/trace_flags of the span active at the log call")
  async stampsInsideSpan() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [otel()] });
    await withSpanAsync("x", {}, async (span) => {
      log.info("hello");
      const rec = sink[0];
      const sc = span.spanContext();
      expect(rec.trace_id).toBe(sc.traceId);
      expect(rec.span_id).toBe(sc.spanId);
      expect(rec.trace_flags).toBe("01"); // sampled → two-char lowercase hex
      expect(rec.message).toBe("hello");
    });
    expect(sink).toHaveLength(1);
  }

  @Test.it("adds nothing outside any active span")
  outsideSpan() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [otel()] });
    log.info("no span here");
    const rec = sink[0];
    expect(rec.trace_id).toBeUndefined();
    expect(rec.span_id).toBeUndefined();
    expect(rec.trace_flags).toBeUndefined();
    expect(rec.message).toBe("no span here");
  }

  @Test.it("keeps call-site meta alongside the injected fields")
  async metaSurvives() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [otel()] });
    await withSpanAsync("meta", {}, async (span) => {
      log.info("with meta", { port: 3000, userId: "u1" });
      const rec = sink[0];
      expect(rec.port).toBe(3000);
      expect(rec.userId).toBe("u1");
      expect(rec.trace_id).toBe(span.spanContext().traceId);
    });
  }

  @Test.it("stamps records from children created AFTER logger.use(otel())")
  async childAfterInstall() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)] });
    log.use(otel()); // install AFTER construction
    const child = log.child({ requestId: "r1" }); // child inherits the format pipeline
    await withSpanAsync("child-span", {}, async (span) => {
      child.info("from child");
      const rec = sink[0];
      expect(rec.trace_id).toBe(span.spanContext().traceId);
      expect(rec.span_id).toBe(span.spanContext().spanId);
      expect(rec.requestId).toBe("r1"); // child bindings preserved
    });
  }

  @Test.it("children created BEFORE the install keep the old pipeline (no stamping)")
  async childBeforeInstall() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)] });
    const early = log.child({ requestId: "early" });
    log.use(otel());
    await withSpanAsync("early-child", {}, async () => {
      early.info("from early child");
      const rec = sink[0];
      expect(rec.trace_id).toBeUndefined();
      expect(rec.requestId).toBe("early");
    });
  }

  @Test.it("honors custom field names")
  async customFields() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(sink)],
      plugins: [otel({ fields: { traceId: "tid", spanId: "sid", traceFlags: "flags" } })],
    });
    await withSpanAsync("custom", {}, async (span) => {
      log.info("renamed");
      const rec = sink[0];
      const sc = span.spanContext();
      expect(rec.tid).toBe(sc.traceId);
      expect(rec.sid).toBe(sc.spanId);
      expect(rec.flags).toBe("01");
      expect(rec.trace_id).toBeUndefined(); // defaults not used
    });
  }

  @Test.it("installing twice on the same logger does not double-wrap")
  async doubleInstall() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)] });
    log.use(otel());
    log.use(otel()); // second install is a no-op
    await withSpanAsync("twice", {}, async (span) => {
      log.info("once");
      const rec = sink[0];
      expect(rec.trace_id).toBe(span.spanContext().traceId);
    });
    expect(sink).toHaveLength(1);
  }

  @Test.it("the install disposer restores original behavior")
  async disposer() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)] });
    const disposable = otel().install(log) as Disposable;
    await withSpanAsync("pre-dispose", {}, async (span) => {
      log.info("stamped");
      expect(sink[0].trace_id).toBe(span.spanContext().traceId);
    });
    disposable[Symbol.dispose]();
    await withSpanAsync("post-dispose", {}, async () => {
      log.info("unstamped");
      expect(sink[1].trace_id).toBeUndefined();
    });
  }
}

await TestApplication().addTests(OtelPluginSuite).reporter(new ConsoleReporter()).run();
await handle.shutdown();
