// Run: pnpm --filter @youneed/server-middleware-http2-guard test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { connect } from "node:http2";
import { http2Guard } from "../src/index.ts";
import type { Http2AbuseInfo } from "../src/index.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Http2GuardSuite extends Test({ name: "server-middleware-http2-guard" }) {
  #server!: HTTP;
  #abuse: Http2AbuseInfo[] = [];

  @Test.beforeAll() async start() {
    const app = Application()
      .use(http2Guard({ windowMs: 5000, maxResetsPerWindow: 10, onAbuse: (i) => this.#abuse.push(i) }))
      .get("/", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41303, { http2: "h2c" }, () => resolve(h));
    });
    await sleep(150);
  }

  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("http2Guard tears down an HTTP/2 Rapid Reset flood") async rapidReset() {
    const abuse = this.#abuse;
    const client = connect("http://127.0.0.1:41303");
    client.on("error", () => {}); // GOAWAY/teardown surfaces as a client error
    // One normal request first → the guard instruments this session.
    await new Promise<void>((res) => {
      const r = client.request({ ":path": "/" });
      r.on("data", () => {});
      r.on("end", () => res());
      r.on("error", () => res());
      r.end();
    });
    // Flood: open a stream then immediately RST_STREAM(CANCEL=8). Past the
    // threshold the guard destroys the session, so request() starts throwing.
    for (let i = 0; i < 40 && abuse.length === 0; i++) {
      try {
        const r = client.request({ ":path": "/" });
        r.on("error", () => {});
        r.close(8);
      } catch {
        break; // session destroyed → no more streams
      }
      await sleep(5);
    }
    await sleep(100);
    try { client.destroy(); } catch { /* already gone */ }
    expect(abuse.length).toBe(1);
    expect(abuse[0].reason).toBe("rapid-reset");
  }
}

await TestApplication().addTests(Http2GuardSuite).reporter(new ConsoleReporter()).run();
