// Run: pnpm --filter @youneed/server-middleware-https-redirect test
// The test server runs over plain HTTP, so requests look "insecure" — the
// middleware redirects unless we forge `X-Forwarded-Proto: https`. We use
// `fetch(..., { redirect: "manual" })` to inspect the redirect instead of following it.
// NOTE: undici (Node's fetch) sets the `Host` header itself from the connection
// authority and ignores a custom one, so we forge the host via `X-Forwarded-Host`
// (which the middleware honors when `trustProxy` is on, the default).
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { httpsRedirect } from "../src/index.ts";

class HttpsRedirectSuite extends Test({ name: "server-middleware-https-redirect" }) {
  #plain!: HTTP; // force-https + trailingSlash: "never"
  #canon!: HTTP; // canonical host
  plain = "http://127.0.0.1:41225";
  canon = "http://127.0.0.1:41226";

  @Test.beforeAll() async start() {
    const plainApp = Application()
      .use(httpsRedirect({ trailingSlash: "never" }))
      .get("/ok", () => Response.json({ ok: true }))
      .get("/users", () => Response.json({ ok: true }));
    const canonApp = Application()
      .use(httpsRedirect({ host: "example.com" }))
      .get("/ok", () => Response.json({ ok: true }));
    this.#plain = await new Promise<HTTP>((r) => {
      const h = plainApp.listen(41225, () => r(h));
    });
    this.#canon = await new Promise<HTTP>((r) => {
      const h = canonApp.listen(41226, () => r(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#plain.close();
    await this.#canon.close();
  }

  @Test.it("plain HTTP request → 308 to https://<host>/...") async forcesHttps() {
    const res = await fetch(`${this.plain}/ok`, {
      redirect: "manual",
      headers: { "x-forwarded-host": "site.test" },
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://site.test/ok");
  }

  @Test.it("X-Forwarded-Proto: https passes through (200, no redirect)") async trustsProxy() {
    const res = await fetch(`${this.plain}/ok`, {
      redirect: "manual",
      headers: { "x-forwarded-host": "site.test", "x-forwarded-proto": "https" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBe(null);
  }

  @Test.it("canonical host redirect → 308 to the forced host") async canonicalHost() {
    const res = await fetch(`${this.canon}/ok`, {
      redirect: "manual",
      headers: { "x-forwarded-host": "www.example.com", "x-forwarded-proto": "https" },
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://example.com/ok");
  }

  @Test.it("already-canonical secure request passes through") async canonicalPass() {
    const res = await fetch(`${this.canon}/ok`, {
      redirect: "manual",
      headers: { "x-forwarded-host": "example.com", "x-forwarded-proto": "https" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBe(null);
  }

  @Test.it("trailingSlash: never strips the trailing slash in the redirect") async stripsSlash() {
    const res = await fetch(`${this.plain}/users/`, {
      redirect: "manual",
      headers: { "x-forwarded-host": "site.test", "x-forwarded-proto": "https" },
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://site.test/users");
  }
}

await TestApplication().addTests(HttpsRedirectSuite).reporter(new ConsoleReporter()).run();
