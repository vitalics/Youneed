// Run: pnpm --filter @youneed/server-middleware-compression test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { compression } from "../src/index.ts";

class CompressionSuite extends Test({ name: "server-middleware-compression" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41204";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(compression({ threshold: 1 }))
      .get("/big", () => Response.json({ blob: "x".repeat(5000) }))
      .get("/small", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41204, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("gzip: Content-Encoding gzip, body intact") async gzip() {
    const r = await fetch(`${this.base}/big`, { headers: { "accept-encoding": "gzip" } });
    const body = (await r.json()) as { blob: string };
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(body.blob.length).toBe(5000);
  }

  @Test.it("brotli: Content-Encoding br") async brotli() {
    const r = await fetch(`${this.base}/big`, { headers: { "accept-encoding": "br" } });
    await r.body?.cancel();
    expect(r.headers.get("content-encoding")).toBe("br");
  }
}

await TestApplication().addTests(CompressionSuite).reporter(new ConsoleReporter()).run();
