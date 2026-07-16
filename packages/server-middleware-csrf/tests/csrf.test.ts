// Run: pnpm --filter @youneed/server-middleware-csrf test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { csrf } from "../src/index.ts";

class CsrfSuite extends Test({ name: "server-middleware-csrf" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41307";
  #token = "";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(csrf())
      .get("/form", () => Response.json({ ok: true }))
      .post("/submit", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41307, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("GET issues a token cookie") async issue() {
    const r = await fetch(`${this.base}/form`);
    const setCookie = r.headers.get("set-cookie") ?? "";
    this.#token = /csrf=([^;]+)/.exec(setCookie)?.[1] ?? "";
    await r.body?.cancel();
    expect(r.status).toBe(200);
    expect(setCookie.includes("csrf=")).toBeTruthy();
    expect(this.#token.length > 0).toBeTruthy();
  }

  @Test.it("POST without the token header is rejected with 403") async blocked() {
    const r = await fetch(`${this.base}/submit`, { method: "POST" });
    await r.body?.cancel();
    expect(r.status).toBe(403);
  }

  @Test.it("POST with the matching token succeeds") async ok() {
    const r = await fetch(`${this.base}/submit`, {
      method: "POST",
      headers: { "x-csrf-token": this.#token, cookie: `csrf=${this.#token}` },
    });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }
}

await TestApplication().addTests(CsrfSuite).reporter(new ConsoleReporter()).run();
