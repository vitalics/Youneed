// Run: pnpm --filter @youneed/ssr-plugin-otel test
// Real OTel SDK, in-memory exporters: one SDK start for the whole file (the
// `startNodeOtel` singleton warns on a second call), spans + metrics read back
// from `InMemorySpanExporter` / `InMemoryMetricExporter`.
//
// dom.ts/page.ts extend HTMLElement at import → register a server DOM first,
// then dynamically import @youneed/ssr and the host plugin.
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { SpanKind, SpanStatusCode } from "@youneed/otel";
import { startNodeOtel } from "@youneed/otel/node";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { get as httpGet } from "node:http";
import { otelModule } from "../src/index.ts";
import type { SsrOtelInspect } from "../src/index.ts";

// registerDOM() installs happy-dom's fetch (same-origin policy blocks 127.0.0.1),
// so hit the server over node:http instead.
function GET(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    }).on("error", reject);
  });
}

registerDOM();
const { Page } = await import("@youneed/ssr");
const { ssr } = await import("@youneed/server-plugin-ssr");

// ── SDK: started ONCE, everything below shares this handle ──────────────────
const spans = new InMemorySpanExporter();
const metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const handle = startNodeOtel({
  serviceName: "ssr-otel-test",
  traceExporter: spans,
  metricReader: new PeriodicExportingMetricReader({ exporter: metrics }),
  batch: false, // SimpleSpanProcessor: every finished span exports immediately
});

const finishedSpans = () => spans.getFinishedSpans();
const metricNames = (): string[] =>
  metrics.getMetrics().flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics.map((m) => m.descriptor.name)));

class HomePage extends Page("/", { title: "Home" }) {
  override render() {
    return "<h1>Home</h1>";
  }
}
class AboutPage extends Page("/about", { title: "About" }) {
  override render() {
    return "<h1>About</h1>";
  }
}
class BoomPage extends Page("/boom", { title: "Boom" }) {
  override render(): string {
    throw new Error("kaboom");
  }
}

const PORT = 41301;

class SsrOtelSuite extends Test({ name: "ssr-plugin-otel" }) {
  #http!: HTTP;
  #mod = otelModule({ handle });
  base = `http://127.0.0.1:${PORT}`;

  @Test.beforeAll() async start() {
    const app = Application()
      .plugin(ssr({ pages: [HomePage, AboutPage, BoomPage], modules: [this.#mod] }))
      .get("/api", () => Response.json({ ok: true }));
    this.#http = await new Promise<HTTP>((resolve) => {
      const h = app.listen(PORT, () => resolve(h));
    });
  }

  @Test.afterAll() async stop() {
    await this.#http.close();
    await handle.shutdown();
  }

  @Test.it("GET of a page exports an ssr.render span with route + status attrs") async pageSpan() {
    spans.reset();
    const res = await GET(`${this.base}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("<h1>Home</h1>");

    await handle.forceFlush();
    const exported = finishedSpans().filter((s) => s.name === "ssr.render /");
    expect(exported).toHaveLength(1);
    const span = exported[0];
    expect(span.kind).toBe(SpanKind.INTERNAL);
    expect(span.attributes["ssr.route"]).toBe("/");
    expect(span.attributes["http.response.status_code"]).toBe(200);
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  }

  @Test.it("a query string still matches the page route") async queryString() {
    spans.reset();
    const res = await GET(`${this.base}/about?tab=team#x`);
    expect(res.status).toBe(200);
    await handle.forceFlush();
    const span = finishedSpans().find((s) => s.name === "ssr.render /about");
    expect(span !== undefined).toBe(true);
    expect(span!.attributes["ssr.route"]).toBe("/about");
  }

  @Test.it("a non-page route produces NO ssr.render span") async nonPage() {
    spans.reset();
    const res = await GET(`${this.base}/api`);
    expect(res.status).toBe(200);
    await handle.forceFlush();
    const renders = finishedSpans().filter((s) => s.name.startsWith("ssr.render"));
    expect(renders).toHaveLength(0);
  }

  @Test.it("ssr.render.count + ssr.render.duration metrics are recorded") async renderMetrics() {
    metrics.reset();
    const res = await GET(`${this.base}/`);
    expect(res.status).toBe(200);
    await handle.forceFlush(); // drives the PeriodicExportingMetricReader now
    const names = metricNames();
    expect(names.includes("ssr.render.count")).toBe(true);
    expect(names.includes("ssr.render.duration")).toBe(true);
  }

  @Test.it("a throwing render ends the span ERROR with an exception event (500)") async errors() {
    spans.reset();
    const res = await GET(`${this.base}/boom`);
    expect(res.status).toBe(500);
    await handle.forceFlush();
    const span = finishedSpans().find((s) => s.name === "ssr.render /boom");
    expect(span !== undefined).toBe(true);
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.attributes["http.response.status_code"]).toBe(500);
    expect(span!.events.some((e) => e.name === "exception")).toBe(true);
  }

  @Test.it("inspect() reports the traced static route count") async inspectShape() {
    const info = this.#mod.inspect?.() as SsrOtelInspect;
    expect(info.kind).toBe("otel");
    expect(info.routes).toBe(3);
    expect(this.#mod.name).toBe("otel");
  }
}

await TestApplication().addTests(SsrOtelSuite).reporter(new ConsoleReporter()).run();
