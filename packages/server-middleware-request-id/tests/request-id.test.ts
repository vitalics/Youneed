// Run: pnpm --filter @youneed/server-middleware-request-id test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { requestId, getRequestId } from "../src/index.ts";

class RequestIdSuite extends Test({ name: "server-middleware-request-id" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41270";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/r", requestId())
      .use("/notrust", requestId({ trustInbound: false }))
      .get("/r", (ctx) => Response.json({ id: getRequestId(ctx) }))
      .get("/notrust", (ctx) => Response.json({ id: getRequestId(ctx) }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41270, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("generates an id, echoes it, body matches header") async generated() {
    const r = await fetch(`${this.base}/r`);
    const b = (await r.json()) as { id: string };
    const header = r.headers.get("x-request-id");
    expect(b.id.length > 0 && header === b.id).toBeTruthy();
  }

  @Test.it("reuses a trusted inbound id") async reuse() {
    const r = await fetch(`${this.base}/r`, { headers: { "x-request-id": "abc-123" } });
    const b = (await r.json()) as { id: string };
    expect(b.id === "abc-123" && r.headers.get("x-request-id") === "abc-123").toBeTruthy();
  }

  @Test.it("rejects an invalid inbound id (spaces) → generates fresh") async invalid() {
    const r = await fetch(`${this.base}/r`, { headers: { "x-request-id": "has spaces!" } });
    const b = (await r.json()) as { id: string };
    expect(b.id !== "has spaces!" && b.id.length > 0).toBeTruthy();
  }

  @Test.it("trustInbound:false ignores the inbound id") async noTrust() {
    const r = await fetch(`${this.base}/notrust`, { headers: { "x-request-id": "abc-123" } });
    const b = (await r.json()) as { id: string };
    expect(b.id !== "abc-123" && b.id.length > 0).toBeTruthy();
  }
}

await TestApplication().addTests(RequestIdSuite).reporter(new ConsoleReporter()).run();
