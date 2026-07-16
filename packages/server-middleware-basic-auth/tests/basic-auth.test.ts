// Run: pnpm --filter @youneed/server-middleware-basic-auth test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { basicAuth, apiKey } from "../src/index.ts";

const PORT = 41227;
const basicHeader = (user: string, pass: string) =>
  "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

class BasicAuthSuite extends Test({ name: "server-middleware-basic-auth" }) {
  #server!: HTTP;
  base = `http://127.0.0.1:${PORT}`;

  @Test.beforeAll() async start() {
    const app = Application()
      // /basic — protected by Basic auth; echoes back the resolved principal.
      .use("/basic", basicAuth({ users: { alice: "s3cret" }, realm: "Admin" }))
      // /key — protected by API-key auth (header + query param).
      .use("/key", apiKey({ keys: ["k-123"], header: "x-api-key", query: "api_key" }))
      .get("/basic", (ctx) => Response.json({ user: ctx.state.user }))
      .get("/key", (ctx) => Response.json({ apiKey: ctx.state.apiKey }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(PORT, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  // ---- Basic auth ----
  @Test.it("no Authorization header → 401 + WWW-Authenticate: Basic") async basicMissing() {
    const r = await fetch(`${this.base}/basic`);
    expect(r.status).toBe(401);
    expect(String(r.headers.get("www-authenticate")).startsWith("Basic")).toBe(true);
  }
  @Test.it("wrong credentials → 401") async basicWrong() {
    const r = await fetch(`${this.base}/basic`, {
      headers: { authorization: basicHeader("alice", "nope") },
    });
    expect(r.status).toBe(401);
  }
  @Test.it("correct credentials → 200 + principal on ctx.state.user") async basicOk() {
    const r = await fetch(`${this.base}/basic`, {
      headers: { authorization: basicHeader("alice", "s3cret") },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { user: { user: string } };
    expect(body.user.user).toBe("alice");
  }

  // ---- API-key auth ----
  @Test.it("missing key → 401") async keyMissing() {
    const r = await fetch(`${this.base}/key`);
    expect(r.status).toBe(401);
  }
  @Test.it("valid x-api-key header → 200") async keyHeader() {
    const r = await fetch(`${this.base}/key`, { headers: { "x-api-key": "k-123" } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { apiKey: { key: string } };
    expect(body.apiKey.key).toBe("k-123");
  }
  @Test.it("valid key via query param → 200") async keyQuery() {
    const r = await fetch(`${this.base}/key?api_key=k-123`);
    expect(r.status).toBe(200);
  }
}

await TestApplication().addTests(BasicAuthSuite).reporter(new ConsoleReporter()).run();
