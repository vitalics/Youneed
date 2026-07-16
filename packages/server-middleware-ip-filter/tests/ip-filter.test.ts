// Run: pnpm --filter @youneed/server-middleware-ip-filter test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP, Context } from "@youneed/server";
import { ipFilter } from "../src/index.ts";

// Drive the IP via a header so tests are deterministic regardless of socket addr.
const fromHeader = (ctx: Context): string => (ctx.request.headers["x-test-ip"] as string) ?? "";

class IpFilterSuite extends Test({ name: "server-middleware-ip-filter" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41220";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/allow", ipFilter({ allow: ["10.0.0.0/8", "192.168.1.5", "2001:db8::/32"], ip: fromHeader }))
      .use("/deny", ipFilter({ deny: ["203.0.113.0/24"], ip: fromHeader }))
      .use("/both", ipFilter({ allow: ["10.0.0.0/8"], deny: ["10.0.0.5"], ip: fromHeader }))
      .get("/allow", () => Response.json({ ok: true }))
      .get("/deny", () => Response.json({ ok: true }))
      .get("/both", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41220, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  #get(path: string, ip: string) {
    return fetch(`${this.base}${path}`, { headers: { "x-test-ip": ip } });
  }

  @Test.it("allowlist: IP in CIDR → 200") async allowIn() {
    const r = await this.#get("/allow", "10.1.2.3");
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("allowlist: exact IP → 200") async allowExact() {
    const r = await this.#get("/allow", "192.168.1.5");
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("allowlist: IP outside → 403") async allowOut() {
    const r = await this.#get("/allow", "192.168.1.6");
    await r.body?.cancel();
    expect(r.status).toBe(403);
  }

  @Test.it("allowlist: IPv6 in range → 200") async allowV6() {
    const r = await this.#get("/allow", "2001:db8:abcd::1");
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("allowlist: IPv4-mapped IPv6 matches v4 rule → 200") async allowMapped() {
    const r = await this.#get("/allow", "::ffff:10.1.2.3");
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("denylist: IP in denied range → 403") async denyIn() {
    const r = await this.#get("/deny", "203.0.113.50");
    await r.body?.cancel();
    expect(r.status).toBe(403);
  }

  @Test.it("denylist: IP elsewhere → 200") async denyOut() {
    const r = await this.#get("/deny", "8.8.8.8");
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("deny wins over allow") async denyWins() {
    const r = await this.#get("/both", "10.0.0.5");
    await r.body?.cancel();
    expect(r.status).toBe(403);
  }

  @Test.it("both: allowed and not denied → 200") async bothOk() {
    const r = await this.#get("/both", "10.0.0.6");
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("unparseable IP fails closed under an allowlist → 403") async failClosed() {
    const r = await this.#get("/allow", "not-an-ip");
    await r.body?.cancel();
    expect(r.status).toBe(403);
  }
}

await TestApplication().addTests(IpFilterSuite).reporter(new ConsoleReporter()).run();
