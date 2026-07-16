// Run: pnpm --filter @youneed/server-middleware-cors test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { cors } from "../src/index.ts";

class CorsSuite extends Test({ name: "server-middleware-cors" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41201";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(cors({ origin: "*", maxAge: 600 }))
      .get("/hello", () => Response.text("hi"));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41201, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("a simple GET reflects Access-Control-Allow-Origin") async simple() {
    const r = await fetch(`${this.base}/hello`, { headers: { origin: "https://app.example" } });
    await r.body?.cancel();
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  }

  @Test.it("a preflight OPTIONS returns 204 with allow-methods + max-age") async preflight() {
    const r = await fetch(`${this.base}/hello`, {
      method: "OPTIONS",
      headers: { origin: "https://app.example", "access-control-request-method": "GET" },
    });
    await r.body?.cancel();
    expect(r.status).toBe(204);
    expect((r.headers.get("access-control-allow-methods") ?? "").includes("GET")).toBeTruthy();
    expect(r.headers.get("access-control-max-age")).toBe("600");
  }
}

await TestApplication().addTests(CorsSuite).reporter(new ConsoleReporter()).run();
