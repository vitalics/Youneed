// Run: pnpm --filter @youneed/server-middleware-metrics test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { metrics, useGlobalCounter, useGlobalHistogram, __resetGlobalMetricsForTests, DEFAULT_BUCKETS } from "../src/index.ts";

interface RawRes {
  status: number;
  body: string;
}
async function get(url: string): Promise<RawRes> {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

class MetricsSuite extends Test({ name: "server-middleware-metrics" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41223";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(metrics())
      .get("/ok", () => Response.json({ ok: true }))
      .get("/users", () => Response.json([{ id: 1 }]));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41223, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("exposes Prometheus text with metric names + TYPE lines") async exposes() {
    await get(`${this.base}/ok`);
    await get(`${this.base}/users`);
    const r = await get(`${this.base}/metrics`);

    expect(r.status).toBe(200);
    // metric names present
    expect(r.body.includes("http_requests_total")).toBe(true);
    expect(r.body.includes("http_request_duration_seconds")).toBe(true);
    expect(r.body.includes("http_requests_in_flight")).toBe(true);
    // # TYPE lines for counter / histogram / gauge
    expect(r.body.includes("# TYPE http_requests_total counter")).toBe(true);
    expect(r.body.includes("# TYPE http_request_duration_seconds histogram")).toBe(true);
    expect(r.body.includes("# TYPE http_requests_in_flight gauge")).toBe(true);
    // a method="GET" status="200" labeled counter sample
    expect(r.body.includes('http_requests_total{method="GET",status="200"}')).toBe(true);
    // histogram series lines
    expect(r.body.includes('http_request_duration_seconds_bucket{')).toBe(true);
    expect(r.body.includes("_bucket{")).toBe(true);
    expect(r.body.includes('le="')).toBe(true);
    expect(r.body.includes("http_request_duration_seconds_sum")).toBe(true);
    expect(r.body.includes("http_request_duration_seconds_count")).toBe(true);
  }

  @Test.it("serves the documented Content-Type") async contentType() {
    const res = await fetch(`${this.base}/metrics`);
    await res.text();
    expect(String(res.headers.get("content-type"))).toBe("text/plain; version=0.0.4; charset=utf-8");
  }

  @Test.it("counts increase across requests") async counts() {
    const before = countFor((await get(`${this.base}/metrics`)).body);
    await get(`${this.base}/ok`);
    await get(`${this.base}/ok`);
    const after = countFor((await get(`${this.base}/metrics`)).body);
    expect(after > before).toBe(true);
    // the histogram _count tracks the same GET/200 observations as the counter
    const histCount = histCountFor((await get(`${this.base}/metrics`)).body);
    expect(histCount >= after).toBe(true);
  }

  @Test.it("default buckets are the prom-client set") async buckets() {
    expect(DEFAULT_BUCKETS.length).toBe(11);
    expect(DEFAULT_BUCKETS[0]).toBe(0.005);
    expect(DEFAULT_BUCKETS[DEFAULT_BUCKETS.length - 1]).toBe(10);
  }

  @Test.it("useGlobalCounter shares one counter across handles and renders it") async globalCounter() {
    __resetGlobalMetricsForTests();
    const a = useGlobalCounter("url_calls");
    const b = useGlobalCounter("url_calls"); // same name → same underlying series
    a.inc({ route: "/users" });
    b.inc({ route: "/users" }, 2);
    b.inc(); // no labels → separate series
    const r = await get(`${this.base}/metrics`);
    expect(r.body.includes("# TYPE url_calls counter")).toBe(true);
    expect(r.body.includes('url_calls{route="/users"} 3')).toBe(true);
    expect(r.body.includes("url_calls 1")).toBe(true);
  }

  @Test.it("useGlobalHistogram renders buckets/sum/count with custom buckets") async globalHistogram() {
    __resetGlobalMetricsForTests();
    const hist = useGlobalHistogram("job_seconds", { buckets: [0.1, 1], help: "Job latency." });
    hist.observe(0.05, { job: "resize" });
    hist.observe(0.5, { job: "resize" });
    const r = await get(`${this.base}/metrics`);
    expect(r.body.includes("# HELP job_seconds Job latency.")).toBe(true);
    expect(r.body.includes("# TYPE job_seconds histogram")).toBe(true);
    expect(r.body.includes('job_seconds_bucket{job="resize",le="0.1"} 1')).toBe(true);
    expect(r.body.includes('job_seconds_bucket{job="resize",le="1"} 2')).toBe(true);
    expect(r.body.includes('job_seconds_bucket{job="resize",le="+Inf"} 2')).toBe(true);
    expect(r.body.includes('job_seconds_sum{job="resize"} 0.55')).toBe(true);
    expect(r.body.includes('job_seconds_count{job="resize"} 2')).toBe(true);
  }

  @Test.it("__resetGlobalMetricsForTests clears registered globals") async resetGlobals() {
    useGlobalCounter("ephemeral_calls").inc();
    __resetGlobalMetricsForTests();
    const r = await get(`${this.base}/metrics`);
    expect(r.body.includes("ephemeral_calls")).toBe(false);
  }
}

/** Pull the GET/200 counter value out of the exposition text. */
function countFor(body: string): number {
  const line = body
    .split("\n")
    .find((l) => l.startsWith('http_requests_total{method="GET",status="200"}'));
  return line ? Number(line.split(" ").pop()) : 0;
}

/** Pull the GET/200 histogram _count value out of the exposition text. */
function histCountFor(body: string): number {
  const line = body
    .split("\n")
    .find((l) => l.startsWith('http_request_duration_seconds_count{method="GET",status="200"}'));
  return line ? Number(line.split(" ").pop()) : 0;
}

await TestApplication().addTests(MetricsSuite).reporter(new ConsoleReporter()).run();
