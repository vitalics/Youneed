// Run: pnpm --filter @youneed/server-middleware-helmet test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { helmet } from "../src/index.ts";

class HelmetSuite extends Test({ name: "server-middleware-helmet" }) {
  #server!: HTTP;
  #nfServer!: HTTP;
  base = "http://127.0.0.1:41206";
  nfBase = "http://127.0.0.1:41207";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(helmet())
      .get("/hello", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41206, () => resolve(h));
    });
    // Second server with a custom option so the default header is genuinely omitted.
    const nfApp = Application()
      .use(helmet({ frameguard: false }))
      .get("/hello", () => Response.json({ ok: true }));
    this.#nfServer = await new Promise<HTTP>((resolve) => {
      const h = nfApp.listen(41207, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
    await this.#nfServer.close();
  }

  @Test.it("sets X-Content-Type-Options: nosniff") async noSniff() {
    const r = await fetch(`${this.base}/hello`);
    await r.body?.cancel();
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  }

  @Test.it("sets X-Frame-Options: SAMEORIGIN") async frameguard() {
    const r = await fetch(`${this.base}/hello`);
    await r.body?.cancel();
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  }

  @Test.it("sets a content-security-policy") async csp() {
    const r = await fetch(`${this.base}/hello`);
    await r.body?.cancel();
    expect(r.headers.get("content-security-policy") != null).toBeTruthy();
  }

  @Test.it("sets strict-transport-security with max-age") async hsts() {
    const r = await fetch(`${this.base}/hello`);
    await r.body?.cancel();
    expect((r.headers.get("strict-transport-security") ?? "").includes("max-age=")).toBeTruthy();
  }

  @Test.it("frameguard:false omits X-Frame-Options") async customOption() {
    const r = await fetch(`${this.nfBase}/hello`);
    await r.body?.cancel();
    expect(r.headers.get("x-frame-options")).toBe(null);
  }
}

await TestApplication().addTests(HelmetSuite).reporter(new ConsoleReporter()).run();
