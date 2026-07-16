// Run: pnpm --filter @youneed/server-middleware-health test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { health } from "../src/index.ts";

class HealthSuite extends Test({ name: "server-middleware-health" }) {
  #server!: HTTP;
  #h = health({ checks: { db: () => HealthSuite.dbUp } });
  static dbUp = true;
  base = "http://127.0.0.1:41222";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(this.#h)
      .get("/", () => Response.json({ hello: "world" }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41222, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("/healthz → 200 ok") async live() {
    const r = await fetch(`${this.base}/healthz`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
  }

  @Test.it("/readyz → 200 ready by default") async ready() {
    this.#h.setReady(true);
    HealthSuite.dbUp = true;
    const r = await fetch(`${this.base}/readyz`);
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("ready");
  }

  @Test.it("setReady(false) → /readyz 503 not ready") async notReady() {
    this.#h.setReady(false);
    expect(this.#h.ready).toBe(false);
    const r = await fetch(`${this.base}/readyz`);
    expect(r.status).toBe(503);
    expect((await r.json()).status).toBe("not ready");
    this.#h.setReady(true); // restore for other tests
  }

  @Test.it("non-probe path falls through to a normal route") async fallthrough() {
    const r = await fetch(`${this.base}/`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hello: "world" });
  }

  @Test.it("a failing check makes /readyz 503 and names the check") async failingCheck() {
    this.#h.setReady(true);
    HealthSuite.dbUp = false;
    const r = await fetch(`${this.base}/readyz`);
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body.status).toBe("not ready");
    expect(body.checks.db).toBe(false);
    HealthSuite.dbUp = true; // restore
  }
}

await TestApplication().addTests(HealthSuite).reporter(new ConsoleReporter()).run();
