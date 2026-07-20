// Run: pnpm --filter @youneed/server-plugin-otel test
// Real OTel SDK, in-memory exporters: one SDK start for the whole file (the
// `startNodeOtel` singleton warns on a second call), spans + metrics read back
// from `InMemorySpanExporter` / `InMemoryMetricExporter`.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { SpanKind, SpanStatusCode, useGlobalCounter } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";
import { Application, Controller, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { otel, otelMiddleware, otelProvider } from "../src/index.ts";
import type { OtelInspect, OtelSpanFacade, ServerOtelApi } from "../src/index.ts";

// ── SDK: started ONCE, everything below shares this handle ──────────────────
const spans = new InMemorySpanExporter();
const metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const handle = startNodeOtel({
  serviceName: "server-otel-test",
  traceExporter: spans,
  metricReader: new PeriodicExportingMetricReader({ exporter: metrics }),
  batch: false, // SimpleSpanProcessor: every finished span exports immediately
});

const finishedSpans = () => spans.getFinishedSpans();
const metricNames = (): string[] =>
  metrics.getMetrics().flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics.map((m) => m.descriptor.name)));

class OtelSuite extends Test({ name: "server-plugin-otel" }) {
  #mw!: HTTP;
  #plug!: HTTP;
  #plugin = otel({ handle, endpoint: "http://otel-collector:4318" });
  mwBase = "http://127.0.0.1:41231";
  pluginBase = "http://127.0.0.1:41232";

  @Test.beforeAll() async start() {
    const mwApp = Application()
      .use(otelMiddleware({ handle }))
      .get("/ok", (ctx) => Response.json({ traceId: (ctx.state.span as OtelSpanFacade).traceId }))
      .get("/boom", () => {
        throw new Error("kaboom");
      });
    this.#mw = await new Promise<HTTP>((resolve) => {
      const h = mwApp.listen(41231, () => resolve(h));
    });

    const pluginApp = Application().plugin(this.#plugin).get("/plugin", () => Response.json({ ok: true }));
    this.#plug = await new Promise<HTTP>((resolve) => {
      const h = pluginApp.listen(41232, () => resolve(h));
    });
  }

  @Test.afterAll() async stop() {
    await this.#mw.close();
    await this.#plug.close();
    // `handle` (the shared SDK) is shut down by the LAST suite below — suites
    // run sequentially and a shutdown SDK silently drops every later span.
  }

  @Test.it("incoming traceparent continues: same traceId, remote parent, facade visible") async propagates() {
    spans.reset();
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const parentSpan = "b7ad6b7169203331";
    const res = await fetch(`${this.mwBase}/ok`, { headers: { traceparent: `00-${traceId}-${parentSpan}-01` } });
    expect(res.status).toBe(200);

    // The facade at ctx.state.span carries the INCOMING trace id to the handler.
    const body = (await res.json()) as { traceId: string };
    expect(body.traceId).toBe(traceId);

    await handle.forceFlush();
    const exported = finishedSpans().filter((s) => s.name === "GET /ok");
    expect(exported).toHaveLength(1);
    const span = exported[0];
    expect(span.kind).toBe(SpanKind.SERVER);
    expect(span.spanContext().traceId).toBe(traceId); // same trace, not a fresh one
    const parent = span.parentSpanContext;
    expect(parent !== undefined).toBe(true);
    expect(parent!.spanId).toBe(parentSpan); // remote parent = incoming parent-id
  }

  @Test.it("span name + http.response.status_code on a 200") async okAttrs() {
    spans.reset();
    await fetch(`${this.mwBase}/ok`);
    await handle.forceFlush();
    const span = finishedSpans().find((s) => s.name === "GET /ok");
    expect(span !== undefined).toBe(true);
    expect(span!.attributes["http.request.method"]).toBe("GET");
    expect(span!.attributes["url.path"]).toBe("/ok");
    expect(span!.attributes["http.response.status_code"]).toBe(200);
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  }

  @Test.it("a throwing route ends the span ERROR with an exception event (500)") async errors() {
    spans.reset();
    const res = await fetch(`${this.mwBase}/boom`);
    expect(res.status).toBe(500);
    await handle.forceFlush();
    const span = finishedSpans().find((s) => s.name === "GET /boom");
    expect(span !== undefined).toBe(true);
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.attributes["http.response.status_code"]).toBe(500);
    expect(span!.events.some((e) => e.name === "exception")).toBe(true);
  }

  @Test.it("http.server.request.duration + http.server.active_requests are recorded") async serverMetrics() {
    metrics.reset();
    await fetch(`${this.mwBase}/ok`);
    await handle.forceFlush(); // drives the PeriodicExportingMetricReader now
    const names = metricNames();
    expect(names.includes("http.server.request.duration")).toBe(true);
    expect(names.includes("http.server.active_requests")).toBe(true);
  }

  @Test.it("otel() plugin: name/inspect/handle + installs the middleware") async pluginShape() {
    expect(this.#plugin.name).toBe("otel");
    expect(this.#plugin.handle === handle).toBe(true); // injected, not started
    const info = this.#plugin.inspect() as OtelInspect;
    expect(info.kind).toBe("otel");
    expect(info.endpoint).toBe("http://otel-collector:4318");

    spans.reset();
    const res = await fetch(`${this.pluginBase}/plugin`);
    expect(res.status).toBe(200);
    await handle.forceFlush();
    expect(finishedSpans().some((s) => s.name === "GET /plugin")).toBe(true);
  }
}

// ── ControllerProvider: typed `this.otel` in a decorator controller ─────────
class ProvController extends Controller("/p", { providers: [otelProvider({ handle })] }) {
  @Controller.get("/trace")
  trace() {
    return Response.json({ traceId: this.otel.traceId });
  }

  @Controller.get("/child")
  child() {
    this.otel.span("child-work", () => {});
    return Response.json({ ok: true });
  }

  @Controller.get("/counter")
  counter() {
    const same = this.otel.counter("url_calls") === useGlobalCounter("url_calls");
    this.otel.counter("url_calls").add(1);
    return Response.json({ same });
  }
}

class OtelProviderSuite extends Test({ name: "server-plugin-otel: provider" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41233";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(otelMiddleware({ handle }))
      .controller(ProvController);
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41233, () => resolve(h));
    });
  }

  @Test.afterAll() async stop() {
    await this.#server.close();
    await handle.shutdown(); // last suite: owns the shared SDK teardown
  }

  @Test.it("this.otel.traceId === the exported SERVER span's traceId (32-hex)") async traceId() {
    spans.reset();
    const res = await fetch(`${this.base}/p/trace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { traceId: string };
    expect(/^[0-9a-f]{32}$/.test(body.traceId)).toBe(true);
    await handle.forceFlush();
    const server = finishedSpans().find((s) => s.name === "GET /p/trace");
    expect(server !== undefined).toBe(true);
    expect(server!.spanContext().traceId).toBe(body.traceId);
  }

  @Test.it("this.otel.span() nests under the request's SERVER span (same trace)") async childSpan() {
    spans.reset();
    const res = await fetch(`${this.base}/p/child`);
    expect(res.status).toBe(200);
    await handle.forceFlush();
    const child = finishedSpans().find((s) => s.name === "child-work");
    const server = finishedSpans().find((s) => s.name === "GET /p/child");
    expect(child !== undefined).toBe(true);
    expect(server !== undefined).toBe(true);
    expect(child!.parentSpanContext !== undefined).toBe(true);
    expect(child!.parentSpanContext!.spanId).toBe(server!.spanContext().spanId);
    expect(child!.spanContext().traceId).toBe(server!.spanContext().traceId);
  }

  @Test.it("this.otel.counter(name) IS useGlobalCounter(name) — one process-wide instrument") async globalCounter() {
    const res = await fetch(`${this.base}/p/counter`);
    expect(res.status).toBe(200); // add(1) in the handler did not throw
    const body = (await res.json()) as { same: boolean };
    expect(body.same).toBe(true);
  }

  @Test.it("outside a request: traceId/spanId undefined, span() still works") async outsideRequest() {
    const provider = otelProvider({ handle });
    const instance: Record<string, unknown> = {};
    provider.install(instance);
    const api = instance.otel as ServerOtelApi;
    expect(api.traceId).toBeUndefined();
    expect(api.spanId).toBeUndefined();
    spans.reset();
    const value = api.span("detached", () => 42);
    expect(value).toBe(42);
    await handle.forceFlush();
    expect(finishedSpans().some((s) => s.name === "detached")).toBe(true);
  }
}

await TestApplication().addTests(OtelSuite).addTests(OtelProviderSuite).reporter(new ConsoleReporter()).run();
