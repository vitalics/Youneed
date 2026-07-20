// Run: pnpm examples:otel
// End-to-end OpenTelemetry demo with the REAL OTel SDK (@youneed/otel):
//   1. a stub OTLP/HTTP receiver (this repo's server, no collector needed)
//   2. a demo API with `@youneed/server-plugin-otel` exporting traces+metrics to it
//   3. a client call via `instrumentedFetch` — CLIENT span + traceparent injection,
//      so the server span continues the SAME trace (printed at the end)
//
// Point `endpoint` at a real collector (http://localhost:4318) to see the same
// data in Jaeger / Tempo / Grafana.
import { instrumentedFetch } from "@youneed/otel";
import { Application } from "@youneed/server";
import { otel } from "@youneed/server-plugin-otel";

const COLLECTOR_PORT = 4198;
const API_PORT = 4199;

const traceBodies: any[] = [];
const metricBodies: any[] = [];

// ── 1. Stub OTLP/HTTP receiver (NOT traced — no feedback loops) ──────────────
const collector = Application()
  .post("/v1/traces", (ctx) => {
    traceBodies.push(ctx.body);
    return { partialSuccess: {} };
  })
  .post("/v1/metrics", (ctx) => {
    metricBodies.push(ctx.body);
    return { partialSuccess: {} };
  })
  .listen(COLLECTOR_PORT, () => console.log(`[collector] OTLP/HTTP receiver on :${COLLECTOR_PORT}`));

// ── 2. Demo API wired to export to the collector ─────────────────────────────
const plugin = otel({
  serviceName: "examples-otel",
  endpoint: `http://localhost:${COLLECTOR_PORT}`,
  metricExportIntervalMs: 500, // fast for the demo; default is 60s
});

const api = Application()
  .get("/hello", () => ({ hello: "world" }))
  .plugin(plugin)
  .listen(API_PORT, () => console.log(`[api] demo server on :${API_PORT} (plugin "otel" installed)`));

await new Promise((r) => setTimeout(r, 150));

// ── 3. Client call through instrumentedFetch (CLIENT span + traceparent) ─────
const res = await instrumentedFetch()(`http://localhost:${API_PORT}/hello`);
console.log(`\n[client] GET /hello → ${res.status}`, await res.json());

await plugin.handle.forceFlush(); // don't wait for batch intervals in a demo
await new Promise((r) => setTimeout(r, 150)); // let the collector routes run

// ── 4. What the collector received ───────────────────────────────────────────
const spans: Array<{ name: string; traceId: string; kind: number }> = [];
for (const body of traceBodies) {
  for (const rs of body?.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const s of ss.spans ?? []) spans.push({ name: s.name, traceId: s.traceId, kind: s.kind });
    }
  }
}

console.log("\n[collector] OTLP /v1/traces spans:");
for (const s of spans) console.log(`  ${s.name.padEnd(12)} traceId=${s.traceId} kind=${s.kind}`);

const clientSpan = spans.find((s) => s.name === "HTTP GET");
const serverSpan = spans.find((s) => s.name === "GET /hello");
const continuity = !!clientSpan && !!serverSpan && clientSpan.traceId === serverSpan.traceId;
console.log(`\n[check] client+server share one traceId (W3C propagation): ${continuity ? "YES" : "NO"}`);
console.log(`[check] OTLP /v1/metrics payloads received: ${metricBodies.length > 0 ? `YES (${metricBodies.length})` : "NO"}`);

if (!continuity || metricBodies.length === 0) {
  console.error("\nFAIL: telemetry did not flow as expected");
  process.exit(1);
}

console.log("\nOK — traces + metrics exported over OTLP/HTTP with end-to-end trace continuity");
await plugin.handle.shutdown();
await api[Symbol.asyncDispose]();
await collector[Symbol.asyncDispose]();
