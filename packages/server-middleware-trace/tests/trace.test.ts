// Run: pnpm --filter @youneed/server-middleware-trace test
// Uses node:http directly so we can read/write the raw `traceparent` header.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { Agent, request } from "node:http";
import { tracing, span, type Span } from "../src/index.ts";

const agent = new Agent({ keepAlive: true });

// W3C traceparent: 00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

interface RawRes {
  status: number;
  headers: Record<string, string | string[] | undefined>;
}
function get(url: string, headers?: Record<string, string>): Promise<RawRes> {
  return new Promise((resolve, reject) => {
    const req = request(url, { agent, headers }, (res) => {
      res.resume(); // drain body
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

class TracingSuite extends Test({ name: "server-middleware-trace" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41224";
  ended: Span[] = [];

  @Test.beforeAll() async start() {
    const app = Application()
      .use(tracing({ onEnd: (s) => this.ended.push(s) }))
      .get("/ok", () => Response.json({ ok: true }))
      .get("/work", (ctx) => {
        span(ctx).setAttribute("user.count", 3);
        span(ctx).addEvent("queried-db");
        return Response.json({ ok: true });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41224, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    agent.destroy();
    await this.#server.close();
  }

  @Test.it("response carries a well-formed traceparent") async wellFormed() {
    const r = await get(`${this.base}/ok`);
    expect(r.status).toBe(200);
    const tp = String(r.headers["traceparent"]);
    expect(TRACEPARENT.test(tp)).toBe(true);
  }

  @Test.it("incoming traceparent propagates its trace-id (new span-id)") async propagates() {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const parentSpan = "b7ad6b7169203331";
    const r = await get(`${this.base}/ok`, { traceparent: `00-${traceId}-${parentSpan}-01` });
    const tp = String(r.headers["traceparent"]);
    const m = TRACEPARENT.exec(tp);
    expect(m !== null).toBe(true);
    expect(m![1]).toBe(traceId); // same trace
    expect(m![2] !== parentSpan).toBe(true); // fresh span id
  }

  @Test.it("span(ctx).setAttribute/addEvent work and onEnd gets the finished span") async hooks() {
    this.ended.length = 0;
    await get(`${this.base}/work`);
    expect(this.ended.length).toBe(1);
    const s = this.ended[0];
    expect(s.name).toBe("GET /work");
    expect(s.attributes["user.count"]).toBe(3);
    expect(s.events.some((e) => e.name === "queried-db")).toBe(true);
    expect(typeof s.duration).toBe("number");
    expect(s.duration! >= 0).toBe(true);
    expect(/^[0-9a-f]{32}$/.test(s.traceId)).toBe(true);
    expect(/^[0-9a-f]{16}$/.test(s.spanId)).toBe(true);
  }
}

await TestApplication().addTests(TracingSuite).reporter(new ConsoleReporter()).run();
