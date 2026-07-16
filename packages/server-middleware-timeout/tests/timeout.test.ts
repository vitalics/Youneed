// Run: pnpm --filter @youneed/server-middleware-timeout test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { timeout } from "../src/index.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TimeoutSuite extends Test({ name: "server-middleware-timeout" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41399";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/slow", timeout(50))
      .use("/gw", timeout(50, { status: 504 }))
      .get("/slow", async () => {
        await sleep(250);
        return Response.json({ ok: true });
      })
      .get("/gw", async () => {
        await sleep(250);
        return Response.json({ ok: true });
      })
      .get("/fast", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41399, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("a slow handler times out with 503") async slow() {
    const r = await fetch(`${this.base}/slow`);
    await r.body?.cancel();
    expect(r.status).toBe(503);
  }

  @Test.it("the status is configurable") async customStatus() {
    const r = await fetch(`${this.base}/gw`);
    await r.body?.cancel();
    expect(r.status).toBe(504);
  }

  @Test.it("a fast handler passes through untouched") async fast() {
    const r = await fetch(`${this.base}/fast`);
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }
}

await TestApplication().addTests(TimeoutSuite).reporter(new ConsoleReporter()).run();
