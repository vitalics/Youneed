// Run: pnpm --filter @youneed/server-middleware-bearer test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { bearer } from "../src/index.ts";

const verify = (token: string) => (token === "good" ? { id: 1, name: "ada" } : false);

class BearerSuite extends Test({ name: "server-middleware-bearer" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41200";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/secure", bearer({ verify }))
      .use("/maybe", bearer({ optional: true, verify }))
      .get("/secure", (ctx) => Response.json(ctx.state.user))
      .get("/maybe", (ctx) => Response.json({ user: ctx.state.user ?? null }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41200, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("401 + WWW-Authenticate challenge without a token") async noToken() {
    const r = await fetch(`${this.base}/secure`);
    await r.body?.cancel();
    expect(r.status).toBe(401);
    expect((r.headers.get("www-authenticate") ?? "").includes("Bearer")).toBeTruthy();
  }

  @Test.it("401 with a bad token") async badToken() {
    const r = await fetch(`${this.base}/secure`, { headers: { authorization: "Bearer bad" } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("200 with a valid token, principal reflected in body") async goodToken() {
    const r = await fetch(`${this.base}/secure`, { headers: { authorization: "Bearer good" } });
    const b = (await r.json()) as { id: number; name: string };
    expect(r.status === 200 && b.id === 1 && b.name === "ada").toBeTruthy();
  }

  @Test.it("optional route passes through with no token") async optionalNoToken() {
    const r = await fetch(`${this.base}/maybe`);
    const b = (await r.json()) as { user: unknown };
    expect(r.status === 200 && b.user === null).toBeTruthy();
  }
}

await TestApplication().addTests(BearerSuite).reporter(new ConsoleReporter()).run();
