// Run: pnpm --filter @youneed/cli-plugin-otel test
// In-memory exporters — no network, no collector. The SDK starts ONCE per
// process (global providers can only be registered once), and the plugin is
// given the handle, so it never flushes/shuts it down — the tests do.
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { Application, Command } from "@youneed/cli";
import { SpanKind, SpanStatusCode, useGlobalCounter } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { otelCommand, otelPlugin } from "../src/index.ts";

const spans = new InMemorySpanExporter();
const metricsExporter = new InMemoryMetricExporter();

const handle = startNodeOtel({
  serviceName: "cli-plugin-otel-test",
  traceExporter: spans,
  metricReader: new PeriodicExportingMetricReader({ exporter: metricsExporter }),
  batch: false, // SimpleSpanProcessor: spans are exported synchronously on end()
});

// Test harness — the packages/cli/tests pattern: no process exit, captured
// output, argv WITHOUT the node/script prefix (run() parses argv directly).
type AppConfig = Parameters<typeof Application>[0];

function harness(
  commands: NonNullable<AppConfig["commands"]>,
  plugins: AppConfig["plugins"] = [otelPlugin({ handle })],
) {
  const out: string[] = [];
  const err: string[] = [];
  const app = Application({
    name: "test-cli",
    version: "1.2.3",
    commands,
    plugins,
    autoRun: false,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    exit: () => {},
  });
  return { out, err, run: (argv: string[]) => app.run(argv) };
}

const spanNamed = (name: string) => spans.getFinishedSpans().find((s) => s.name === name);

class CliOtelSuite extends Test({ name: "cli-plugin-otel" }) {
  @Test.it("exports one cli.command span per run with program/command/args attributes")
  async commandSpan() {
    class Hello extends Command({ name: "hello <name>", middleware: [otelCommand()] }) {
      execute(_name: string) {}
    }
    spans.reset();
    const h = harness([Hello]);
    const code = await h.run(["hello", "world"]);
    expect(code).toBe(0);

    const span = spanNamed("cli.command hello")!;
    expect(span === undefined).toBe(false);
    expect(span.kind).toBe(SpanKind.INTERNAL);
    expect(span.attributes["cli.command.name"]).toBe("hello");
    expect(span.attributes["cli.command.args"]).toEqual(["world"]);
    expect(span.attributes["cli.program.name"]).toBe("test-cli");
    expect(span.attributes["cli.program.version"]).toBe("1.2.3");
    expect(span.attributes["cli.command.error"]).toBeUndefined();
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.resource.attributes["service.name"]).toBe("cli-plugin-otel-test");
  }

  @Test.it("records a thrown error on the span: ERROR status + one exception event")
  async errorSpan() {
    class Boom extends Command({ name: "boom", middleware: [otelCommand()] }) {
      execute(): never {
        throw new Error("kaput");
      }
    }
    spans.reset();
    const h = harness([Boom]);
    const code = await h.run(["boom"]);
    expect(code).toBe(1);

    const span = spanNamed("cli.command boom")!;
    expect(span === undefined).toBe(false);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe("kaput");
    expect(span.attributes["cli.command.error"]).toBe(true);
    // exactly ONE exception event — the plugin's onError dedupes the middleware's record
    const exceptions = span.events.filter((e) => e.name === "exception");
    expect(exceptions).toHaveLength(1);
  }

  @Test.it("this.otel child spans nest under the command span (same trace)")
  async childSpans() {
    let seen = 0;
    class Child extends Command({ name: "child", middleware: [otelCommand()] }) {
      async execute() {
        const sync = this.otel.span("child-sync", () => 21);
        seen = await this.otel.spanAsync("child-async", async () => sync * 2);
      }
    }
    spans.reset();
    const h = harness([Child]);
    const code = await h.run(["child"]);
    expect(code).toBe(0);
    expect(seen).toBe(42);

    const parent = spanNamed("cli.command child")!;
    const syncChild = spanNamed("child-sync")!;
    const asyncChild = spanNamed("child-async")!;
    expect(parent === undefined || syncChild === undefined || asyncChild === undefined).toBe(false);
    const parentCtx = parent.spanContext();
    expect(syncChild.parentSpanContext?.spanId).toBe(parentCtx.spanId);
    expect(asyncChild.parentSpanContext?.spanId).toBe(parentCtx.spanId);
    expect(syncChild.spanContext().traceId).toBe(parentCtx.traceId);
    expect(asyncChild.spanContext().traceId).toBe(parentCtx.traceId);
  }

  @Test.it("this.otel counter/histogram delegate to the process-wide global metrics")
  async globalMetrics() {
    let same = false;
    class Metrics extends Command({ name: "metrics", middleware: [otelCommand()] }) {
      execute() {
        same = this.otel.counter("cmd_url_calls") === useGlobalCounter("cmd_url_calls");
        // exercise the recording path (recording itself is proven in @youneed/otel tests);
        // no forceFlush here — the shared reader is delta-like per collection, and the
        // next test relies on still-pending datapoints from earlier runs
        this.otel.counter("cmd_url_calls").add(3, { command: "metrics" });
        this.otel.histogram("cmd_job_seconds").record(0.1);
      }
    }
    const h = harness([Metrics]);
    const code = await h.run(["metrics"]);
    expect(code).toBe(0);
    expect(same).toBe(true);
  }

  @Test.it("afterCommand records cli.command.count with command + exit_code attributes")
  async commandMetrics() {
    class Count extends Command({ name: "count", middleware: [otelCommand()] }) {
      execute() {}
    }
    metricsExporter.reset();
    const h = harness([Count]);
    const code = await h.run(["count"]);
    expect(code).toBe(0);
    // The handle is INJECTED, so the plugin does not flush — the test does.
    await handle.forceFlush();

    const [rm] = metricsExporter.getMetrics();
    const metric = rm.scopeMetrics[0].metrics.find((m) => m.descriptor.name === "cli.command.count")!;
    expect(metric === undefined).toBe(false);
    const pointOf = (command: string) =>
      metric.dataPoints.find((dp) => dp.attributes?.["command"] === command);

    const counted = pointOf("count")!;
    expect(counted === undefined).toBe(false);
    expect(counted.attributes?.["exit_code"]).toBe(0);
    expect(Number(counted.value)).toBe(1);

    // the failing command from the earlier test ran with the same plugin metrics
    const boomed = pointOf("boom")!;
    expect(boomed === undefined).toBe(false);
    expect(boomed.attributes?.["exit_code"]).toBe(1);

    const duration = rm.scopeMetrics[0].metrics.find(
      (m) => m.descriptor.name === "cli.command.duration",
    )!;
    expect(duration === undefined).toBe(false);
    expect(duration.dataPoints.length).toBeGreaterThan(0);
  }

  @Test.it("middleware alone falls back to the global tracer (no plugin wired)")
  async middlewareOnly() {
    class Plain extends Command({ name: "plain", middleware: [otelCommand()] }) {
      execute() {}
    }
    spans.reset();
    const h = harness([Plain], []);
    const code = await h.run(["plain"]);
    expect(code).toBe(0);
    expect(spanNamed("cli.command plain") === undefined).toBe(false);
  }
}

await TestApplication().addTests(CliOtelSuite).reporter(new ConsoleReporter()).run();
await handle.shutdown();
