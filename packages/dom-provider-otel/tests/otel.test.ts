// Run: pnpm --filter @youneed/dom-provider-otel test
// Render spans + dom.render metrics with the real OTel WEB SDK under happy-dom —
// in-memory exporters, no network, no collector. Order matters: happy-dom is
// registered BEFORE importing the framework (its classes `extends HTMLElement`
// at module load), and the Web SDK is started ONCE (its providers are global).
import { registerDOM } from "@youneed/dom/register";
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { noopHandle, SpanStatusCode, useGlobalCounter } from "@youneed/otel";
import { startWebOtel } from "@youneed/otel/web";
import { getDomOtel, initDomOtel, otelProvider, type DomOtelApi } from "../src/index.ts";

registerDOM();
const { Component, html, define, flushSync, setErrorHandler } = await import("@youneed/dom");

const spans = new InMemorySpanExporter();
const metricsExporter = new InMemoryMetricExporter();

// One Web SDK start per process — WebTracerProvider/MeterProvider register
// globally and can only register once. batch:false → SimpleSpanProcessor, so
// spans are exported synchronously on end(); flushOnHide:false → no
// pagehide/visibilitychange listeners under happy-dom. (register() behaves
// fine here: the web provider's default StackContextManager is pure JS.)
const handle = startWebOtel({
  serviceName: "dom-otel-test",
  traceExporter: spans,
  metricReader: new PeriodicExportingMetricReader({ exporter: metricsExporter }),
  batch: false,
  flushOnHide: false,
});

// The app-wide singleton providers fall back to when no handle is passed.
initDomOtel({ handle });

// Contained render errors land here instead of the default console.error.
const globalErrors: { error: unknown; phase: string; tag: string }[] = [];
setErrorHandler((error, info) => globalErrors.push({ error, phase: info.phase, tag: info.tag }));

// Default handle via the app-wide singleton (initDomOtel above).
class Card extends Component("x-otel-card", { providers: [otelProvider()] }) {
  n = 0;
  render() {
    return html`<span>card ${this.n}</span>`;
  }
}

// Render throws on update — contained by the framework, observed by the span.
class Boom extends Component("x-otel-boom", { providers: [otelProvider({ handle })] }) {
  n = 0;
  render() {
    if (this.n > 0) throw new Error("render boom");
    return html`<span>boom ${this.n}</span>`;
  }
}

// tracedEffect + tracedListen in onMount.
class Fx extends Component("x-otel-fx", { providers: [otelProvider({ handle })] }) {
  clicks = 0;
  onMount() {
    this.otel.tracedEffect(() => {
      document.title = `clicks: ${this.clicks}`;
    });
    this.otel.tracedListen("click", () => {
      this.clicks++;
    });
  }
  render() {
    return html`<button>fx ${this.clicks}</button>`;
  }
}

// renderSpans: false — api installed, renders untraced.
class Quiet extends Component("x-otel-quiet", {
  providers: [otelProvider({ handle, renderSpans: false })],
}) {
  render() {
    return html`<span>quiet</span>`;
  }
}

// Disabled handle — a working no-op api on an untraced component.
class Off extends Component("x-otel-off", { providers: [otelProvider({ handle: noopHandle() })] }) {
  render() {
    return html`<span>off</span>`;
  }
}

define(Card, Boom, Fx, Quiet, Off);

// ── type-level checks (never executed) ───────────────────────────────────────
() => {
  const el = document.createElement("x-otel-card") as InstanceType<typeof Card>;
  el.otel.span("x", () => 1); // ✓ typed contribution
  el.otel.spanAsync("y", async () => "ok"); // ✓
  el.otel.tracedEffect(() => {}); // ✓
  el.otel.tracedListen("click", (e) => e.type); // ✓
  el.otel.tracer; // ✓
  // @ts-expect-error — not part of DomOtelApi
  el.otel.nope();
};

const root = document.createElement("div");
document.body.appendChild(root);
const mount = <T extends HTMLElement>(tag: string): T => {
  const el = document.createElement(tag) as T;
  root.appendChild(el);
  flushSync();
  return el;
};
const renderSpans = (tag: string) => spans.getFinishedSpans().filter((s) => s.name === `dom.render ${tag}`);

class DomOtelSuite extends Test({ name: "dom-provider-otel" }) {
  @Test.it("getDomOtel returns the app-wide handle set by initDomOtel") singleton() {
    expect(getDomOtel()).toBe(handle);
    expect(handle.enabled).toBe(true);
  }

  @Test.it("the FIRST render is a dom.render <tag> span (connectedCallback bypasses flush)") firstRender() {
    spans.reset();
    mount("x-otel-card");
    const found = renderSpans("x-otel-card");
    expect(found).toHaveLength(1);
    expect(found[0].attributes.tag).toBe("x-otel-card");
    expect(found[0].status.code).toBe(SpanStatusCode.UNSET);
    expect(found[0].resource.attributes["service.name"]).toBe("dom-otel-test");
  }

  @Test.it("a scheduled update renders through the wrapped flush()") updateRender() {
    const el = mount<HTMLElement & { n: number; requestUpdate(): void }>("x-otel-card");
    spans.reset();
    el.n = 1;
    el.requestUpdate();
    flushSync();
    const found = renderSpans("x-otel-card");
    expect(found).toHaveLength(1); // one span per render — no flush/render double-count
    expect(el.shadowRoot?.textContent).toContain("card 1");
  }

  @Test.it("a contained render error lands on the span (ERROR status + exception event)") renderError() {
    const el = mount<HTMLElement & { n: number; requestUpdate(): void }>("x-otel-boom");
    spans.reset();
    const before = globalErrors.length;
    el.n = 1;
    el.requestUpdate();
    flushSync(); // must NOT crash the batch — the framework contains the error
    const found = renderSpans("x-otel-boom");
    expect(found).toHaveLength(1);
    expect(found[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(found[0].status.message).toBe("render boom");
    expect(found[0].events.some((e) => e.name === "exception")).toBe(true);
    // …and the framework's own routing still happened, unchanged.
    expect(globalErrors.length).toBe(before + 1);
    expect(globalErrors[globalErrors.length - 1].phase).toBe("update");
    expect(globalErrors[globalErrors.length - 1].tag).toBe("x-otel-boom");
  }

  @Test.it("tracedEffect wraps effect runs in a dom.effect <tag> span") effectSpan() {
    spans.reset();
    mount("x-otel-fx");
    const found = spans.getFinishedSpans().filter((s) => s.name === "dom.effect x-otel-fx");
    expect(found).toHaveLength(1);
    expect(found[0].attributes.tag).toBe("x-otel-fx");
  }

  @Test.it("tracedListen wraps handler invocations in a dom.event <type> <tag> span") eventSpan() {
    const el = mount<HTMLElement & { clicks: number }>("x-otel-fx");
    spans.reset();
    el.click();
    const found = spans.getFinishedSpans().filter((s) => s.name === "dom.event click x-otel-fx");
    expect(found).toHaveLength(1);
    expect(found[0].attributes.tag).toBe("x-otel-fx");
    expect(el.clicks).toBe(1); // the handler still ran, unchanged
  }

  @Test.it("renderSpans:false installs the api without render instrumentation") quiet() {
    spans.reset();
    const el = mount<HTMLElement & { otel: DomOtelApi }>("x-otel-quiet");
    expect(renderSpans("x-otel-quiet")).toHaveLength(0);
    const out = el.otel.span("manual", () => 42);
    expect(out).toBe(42);
    expect(spans.getFinishedSpans().some((s) => s.name === "manual")).toBe(true);
  }

  @Test.it("a disabled handle still installs a working no-op api") disabled() {
    spans.reset();
    const el = mount<HTMLElement & { otel: DomOtelApi }>("x-otel-off");
    expect(renderSpans("x-otel-off")).toHaveLength(0);
    expect(el.shadowRoot?.textContent).toContain("off");
    const out = el.otel.span("via-off", () => "ok");
    expect(out).toBe("ok");
  }

  @Test.it("renders are measured: dom.render.count + dom.render.duration metrics") async metrics() {
    const el = mount<HTMLElement & { n: number; requestUpdate(): void }>("x-otel-card");
    el.n = 2;
    el.requestUpdate();
    flushSync();
    await handle.forceFlush();
    const exported = metricsExporter.getMetrics();
    expect(exported.length).toBeGreaterThan(0);
    const all = exported.flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));
    const count = all.find((m) => m.descriptor.name === "dom.render.count");
    const duration = all.find((m) => m.descriptor.name === "dom.render.duration");
    expect(count).toBeTruthy();
    expect(duration).toBeTruthy();
    const total = (count?.dataPoints ?? []).reduce((acc, dp) => acc + Number(dp.value), 0);
    expect(total).toBeGreaterThan(0);
    expect(count?.dataPoints.some((dp) => dp.attributes?.tag === "x-otel-card")).toBe(true);
  }

  @Test.it("this.otel counter/histogram delegate to the process-wide global metrics") async globalMetrics() {
    const el = mount<HTMLElement & { otel: DomOtelApi }>("x-otel-card");
    expect(el.otel.counter("dom_url_calls")).toBe(useGlobalCounter("dom_url_calls"));
    el.otel.counter("dom_url_calls").add(2, { tag: "x-otel-card" });
    el.otel.histogram("dom_job_seconds").record(0.3);
    await handle.forceFlush();
    const all = metricsExporter.getMetrics().flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));
    const counter = all.find((m) => m.descriptor.name === "dom_url_calls");
    expect(counter?.dataPoints.reduce((acc, dp) => acc + Number(dp.value), 0)).toBe(2);
    expect(all.some((m) => m.descriptor.name === "dom_job_seconds")).toBe(true);
  }
}

await TestApplication().addTests(DomOtelSuite).reporter(new ConsoleReporter()).run();
await handle.shutdown();
