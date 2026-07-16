// Run: pnpm --filter @youneed/server-middleware-load-shed test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { loadShed } from "../src/index.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class LoadShedSuite extends Test({ name: "server-middleware-load-shed" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41221";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(loadShed({ maxConcurrent: 1, retryAfter: 2 }))
      .get("/fast", () => Response.json({ ok: true }))
      .get("/slow", async () => {
        await sleep(120); // hold the single slot so concurrent requests get shed
        return Response.json({ ok: true });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41221, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("under the limit, requests pass (200)") async passes() {
    const r = await fetch(`${this.base}/fast`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }

  @Test.it("surplus concurrent requests are shed with 503 + Retry-After while one succeeds") async sheds() {
    const N = 5;
    const responses = await Promise.all(Array.from({ length: N }, () => fetch(`${this.base}/slow`)));
    const ok = responses.filter((r) => r.status === 200);
    const shed = responses.filter((r) => r.status === 503);

    expect(ok.length).toBe(1); // exactly one fits in the single slot
    expect(shed.length).toBe(N - 1); // the rest are shed

    const first = shed[0];
    expect(first.headers.get("retry-after")).toBe("2");
    expect((await first.json()).error).toBe("Service Unavailable");
    // drain any bodies we haven't consumed
    await Promise.all(responses.map((r) => r.body?.cancel().catch(() => {})));
  }

  @Test.it("after the in-flight requests drain, a new request passes again (counter decremented)") async drains() {
    await sleep(200); // let the slow handler finish and release the slot
    const r = await fetch(`${this.base}/slow`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }
}

await TestApplication().addTests(LoadShedSuite).reporter(new ConsoleReporter()).run();
