// Run: pnpm --filter @youneed/server-middleware-body-limit test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { bodyLimit } from "../src/index.ts";

class BodyLimitSuite extends Test({ name: "server-middleware-body-limit" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41208";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/upload", bodyLimit(1024))
      .use("/u2", bodyLimit("1kb"))
      .post("/upload", (ctx) => Response.json({ size: JSON.stringify(ctx.body ?? "").length }))
      .post("/u2", (ctx) => Response.json({ size: JSON.stringify(ctx.body ?? "").length }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41208, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("a small body passes through with 200") async under() {
    const body = JSON.stringify({ hello: "world" });
    const r = await fetch(`${this.base}/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("a body over 1kb is rejected with 413") async over() {
    const body = JSON.stringify({ blob: "x".repeat(2000) });
    const r = await fetch(`${this.base}/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await r.body?.cancel();
    expect(r.status).toBe(413);
  }

  @Test.it('the string form "1kb" parses and rejects >1kb with 413') async stringForm() {
    const body = JSON.stringify({ blob: "x".repeat(2000) });
    const r = await fetch(`${this.base}/u2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await r.body?.cancel();
    expect(r.status).toBe(413);
  }
}

await TestApplication().addTests(BodyLimitSuite).reporter(new ConsoleReporter()).run();
