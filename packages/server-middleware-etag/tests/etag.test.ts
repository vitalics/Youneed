// Run: pnpm --filter @youneed/server-middleware-etag test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { etag } from "../src/index.ts";

class EtagSuite extends Test({ name: "server-middleware-etag" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41209";
  #tag = "";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(etag())
      .get("/data", () => Response.json({ hello: "world" }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41209, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("GET /data → 200 with an ETag header") async present() {
    const r = await fetch(`${this.base}/data`);
    await r.body?.cancel();
    expect(r.status).toBe(200);
    this.#tag = r.headers.get("etag") ?? "";
    expect(this.#tag.length > 0).toBeTruthy();
  }

  @Test.it("If-None-Match with the captured ETag → 304") async notModified() {
    const first = await fetch(`${this.base}/data`);
    const tag = first.headers.get("etag") ?? "";
    await first.body?.cancel();
    const r = await fetch(`${this.base}/data`, { headers: { "if-none-match": tag } });
    await r.body?.cancel();
    expect(r.status).toBe(304);
  }

  @Test.it("If-None-Match with a wrong ETag → 200 (body served)") async mismatch() {
    const r = await fetch(`${this.base}/data`, { headers: { "if-none-match": '"wrong"' } });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }
}

await TestApplication().addTests(EtagSuite).reporter(new ConsoleReporter()).run();
