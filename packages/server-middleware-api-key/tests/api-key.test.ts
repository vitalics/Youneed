// Run: pnpm --filter @youneed/server-middleware-api-key test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { createHash } from "node:crypto";
import { apiKey } from "../src/index.ts";

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

class ApiKeySuite extends Test({ name: "server-middleware-api-key" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41240";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/flat", apiKey({ keys: ["k_live_abc"] }))
      .use("/mapped", apiKey({ keys: { k_live_abc: { name: "billing", scopes: ["read"] } } }))
      .use("/hashed", apiKey({ hashed: true, keys: [sha256hex("k_secret")] }))
      .use("/query", apiKey({ keys: ["qk"], query: "api_key" }))
      .use("/scheme", apiKey({ keys: ["sk"], scheme: "ApiKey" }))
      .use("/dyn", apiKey({ verify: (k) => (k === "dynamic" ? { id: 7 } : false) }))
      .use("/forbidden", apiKey({ keys: ["fk"], status: 403 }))
      .use("/maybe", apiKey({ keys: ["mk"], optional: true }))
      .get("/flat", () => Response.json({ ok: true }))
      .get("/mapped", (ctx) => Response.json(ctx.state.apiClient))
      .get("/hashed", () => Response.json({ ok: true }))
      .get("/query", () => Response.json({ ok: true }))
      .get("/scheme", () => Response.json({ ok: true }))
      .get("/dyn", (ctx) => Response.json(ctx.state.apiClient))
      .get("/forbidden", () => Response.json({ ok: true }))
      .get("/maybe", (ctx) => Response.json({ client: ctx.state.apiClient ?? null }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41240, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("flat allowlist: valid key → 200") async flatOk() {
    const r = await fetch(`${this.base}/flat`, { headers: { "x-api-key": "k_live_abc" } });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("flat allowlist: wrong key → 401") async flatBad() {
    const r = await fetch(`${this.base}/flat`, { headers: { "x-api-key": "nope" } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("no key → 401 + WWW-Authenticate") async noKey() {
    const r = await fetch(`${this.base}/flat`);
    await r.body?.cancel();
    expect(r.status === 401 && (r.headers.get("www-authenticate") ?? "").includes("ApiKey")).toBeTruthy();
  }

  @Test.it("mapped key: principal reflected on ctx.state.apiClient") async mapped() {
    const r = await fetch(`${this.base}/mapped`, { headers: { "x-api-key": "k_live_abc" } });
    const b = (await r.json()) as { name: string; scopes: string[] };
    expect(b.name === "billing" && b.scopes[0] === "read").toBeTruthy();
  }

  @Test.it("hashed config: matches by digest of the real key → 200") async hashed() {
    const r = await fetch(`${this.base}/hashed`, { headers: { "x-api-key": "k_secret" } });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("query param source → 200") async query() {
    const r = await fetch(`${this.base}/query?api_key=qk`);
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("Authorization scheme source → 200") async scheme() {
    const r = await fetch(`${this.base}/scheme`, { headers: { authorization: "ApiKey sk" } });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("dynamic verify: known key → 200, principal set") async dyn() {
    const r = await fetch(`${this.base}/dyn`, { headers: { "x-api-key": "dynamic" } });
    const b = (await r.json()) as { id: number };
    expect(r.status === 200 && b.id === 7).toBeTruthy();
  }

  @Test.it("custom status: bad key → 403") async forbidden() {
    const r = await fetch(`${this.base}/forbidden`, { headers: { "x-api-key": "wrong" } });
    await r.body?.cancel();
    expect(r.status).toBe(403);
  }

  @Test.it("optional route passes through with no key") async optional() {
    const r = await fetch(`${this.base}/maybe`);
    const b = (await r.json()) as { client: unknown };
    expect(r.status === 200 && b.client === null).toBeTruthy();
  }
}

await TestApplication().addTests(ApiKeySuite).reporter(new ConsoleReporter()).run();
