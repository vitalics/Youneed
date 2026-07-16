// Run: pnpm --filter @youneed/server-middleware-trust-proxy test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { trustProxy, clientInfo } from "../src/index.ts";

class TrustProxySuite extends Test({ name: "server-middleware-trust-proxy" }) {
  #trusted!: HTTP;
  #untrusted!: HTTP;
  trustedBase = "http://127.0.0.1:41228";
  untrustedBase = "http://127.0.0.1:41229";

  @Test.beforeAll() async start() {
    const trustedApp = Application()
      .use(trustProxy({ hops: 1 }))
      .get("/whoami", (ctx) => Response.json(clientInfo(ctx)));
    const untrustedApp = Application()
      .use(trustProxy({ trust: false }))
      .get("/whoami", (ctx) => Response.json(clientInfo(ctx)));
    this.#trusted = await new Promise<HTTP>((resolve) => {
      const h = trustedApp.listen(41228, () => resolve(h));
    });
    this.#untrusted = await new Promise<HTTP>((resolve) => {
      const h = untrustedApp.listen(41229, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#trusted.close();
    await this.#untrusted.close();
  }

  @Test.it("resolves client IP from X-Forwarded-For (hops=1 → first entry)") async ip() {
    const r = await fetch(`${this.trustedBase}/whoami`, {
      headers: { "X-Forwarded-For": "1.2.3.4, 10.0.0.1" },
    });
    const info = (await r.json()) as { ip: string };
    expect(info.ip).toBe("1.2.3.4");
  }

  @Test.it("resolves protocol from X-Forwarded-Proto") async proto() {
    const r = await fetch(`${this.trustedBase}/whoami`, {
      headers: { "X-Forwarded-Proto": "https" },
    });
    const info = (await r.json()) as { protocol: string };
    expect(info.protocol).toBe("https");
  }

  @Test.it("resolves host from X-Forwarded-Host") async host() {
    const r = await fetch(`${this.trustedBase}/whoami`, {
      headers: { "X-Forwarded-Host": "api.example.com" },
    });
    const info = (await r.json()) as { host: string };
    expect(info.host).toBe("api.example.com");
  }

  @Test.it("trust:false ignores forwarded headers → socket address + http") async untrusted() {
    const r = await fetch(`${this.untrustedBase}/whoami`, {
      headers: {
        "X-Forwarded-For": "1.2.3.4, 10.0.0.1",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "api.example.com",
      },
    });
    const info = (await r.json()) as { ip: string; protocol: string };
    // loopback socket address — IPv6 `::1` or IPv4 (possibly IPv4-mapped) `127.0.0.1`
    expect(/(^|:)(::1|127\.0\.0\.1)$/.test(info.ip)).toBe(true);
    expect(info.ip).not.toBe("1.2.3.4"); // forwarded header was ignored
    expect(info.protocol).toBe("http"); // X-Forwarded-Proto ignored
  }
}

await TestApplication().addTests(TrustProxySuite).reporter(new ConsoleReporter()).run();
