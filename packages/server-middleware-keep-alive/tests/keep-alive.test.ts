// Run: pnpm --filter @youneed/server-middleware-keep-alive test
// Uses node:http (fetch/undici strips hop-by-hop headers like Keep-Alive/Connection).
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { Agent, request } from "node:http";
import { keepAlive, connection } from "../src/index.ts";

const agent = new Agent({ keepAlive: true }); // HTTP/1.1 persistent → server advertises Keep-Alive

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

class KeepAliveSuite extends Test({ name: "server-middleware-keep-alive" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41217";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(keepAlive({ timeout: 7, max: 100 }))
      .get("/ok", () => Response.json({ ok: true }))
      .get("/bye", (ctx) => {
        connection(ctx).close(); // close after this response
        return Response.json({ ok: true });
      })
      .get("/malware", (ctx) => {
        if (ctx.request.headers["x-malware"]) {
          connection(ctx).destroy(); // tear the socket down immediately
          return Response.json({ blocked: true }, { status: 403 });
        }
        return Response.json({ ok: true });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41217, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    agent.destroy();
    await this.#server.close();
  }

  @Test.it("advertises Keep-Alive: timeout + max") async advertises() {
    const r = await get(`${this.base}/ok`);
    expect(r.headers["keep-alive"]).toBe("timeout=7, max=100");
  }
  @Test.it("connection(ctx).close() → Connection: close, no Keep-Alive") async closes() {
    const r = await get(`${this.base}/bye`);
    expect(r.status).toBe(200);
    expect(String(r.headers["connection"]).toLowerCase()).toBe("close");
    expect(r.headers["keep-alive"]).toBeUndefined();
  }
  @Test.it("destroy() tears the socket down → client sees a reset") async malware() {
    let errored = false;
    try {
      await get(`${this.base}/malware`, { "x-malware": "1" });
    } catch {
      errored = true;
    }
    expect(errored).toBe(true);
  }
  @Test.it("without the abuse header the malware route responds normally") async clean() {
    const r = await get(`${this.base}/malware`);
    expect(r.status).toBe(200);
    expect(r.headers["keep-alive"]).toBe("timeout=7, max=100");
  }
}

await TestApplication().addTests(KeepAliveSuite).reporter(new ConsoleReporter()).run();
