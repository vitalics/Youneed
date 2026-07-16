import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { buildCspHeader, injectNonce, cspMiddleware, csp } from "../src/index.ts";

const HTML =
  '<html><head></head><body><h1>hi</h1>' +
  '<script type="application/json" data-hydrate>{"a":1}</script>' +
  '<script src="/client.js" type="module"></script></body></html>';

function listen(app: ReturnType<typeof Application>, port: number): Promise<HTTP> {
  return new Promise((resolve) => {
    const http = app.listen(port, () => resolve(http));
  });
}

class CspUnitSuite extends Test({ name: "ssr-plugin-csp: builders" }) {
  @Test.it("default header") def() {
    const h = buildCspHeader({});
    expect(h).toContain("default-src 'self'");
    expect(h).toContain("script-src 'self'");
    expect(h).toContain("object-src 'none'");
  }

  @Test.it("nonce added to script-src") nonce() {
    const h = buildCspHeader({}, { nonce: "abc123" });
    expect(h).toContain("script-src 'self' 'nonce-abc123'");
  }

  @Test.it("styleNonce drops unsafe-inline, nonces style-src") style() {
    const h = buildCspHeader({}, { nonce: "n", styleNonce: true });
    expect(h).not.toContain("'unsafe-inline'");
    expect(h).toContain("style-src 'self' 'nonce-n'");
  }

  @Test.it("directive override + false drops") override() {
    const h = buildCspHeader({ "img-src": ["'self'", "https://cdn"], "object-src": false });
    expect(h).toContain("img-src 'self' https://cdn");
    expect(h).not.toContain("object-src");
  }

  @Test.it("injectNonce adds once, not twice") inject() {
    const once = injectNonce("<script>a</script>", "N");
    expect(once).toBe('<script nonce="N">a</script>');
    expect(injectNonce(once, "N")).toBe(once); // already has nonce → untouched
  }
}

class CspIntegrationSuite extends Test({ name: "ssr-plugin-csp: middleware" }) {
  @Test.it("document response: nonce in header matches body scripts")
  async document() {
    const port = 41955;
    const app = Application();
    app.use(cspMiddleware());
    app.get("/", () =>
      Response({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: HTML }),
    );
    const http = (await listen(app, port)) as unknown as { drain: () => Promise<void> };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
      const header = res.headers.get("content-security-policy") ?? "";
      const body = await res.text();
      const m = /'nonce-([^']+)'/.exec(header);
      expect(m).toBeTruthy();
      const nonce = m![1];
      // every inline + external script tag carries the nonce
      expect(body).toContain(`<script nonce="${nonce}" type="application/json"`);
      expect(body).toContain(`<script nonce="${nonce}" src="/client.js"`);
    } finally {
      await http.drain();
    }
  }

  @Test.it("non-document request is left untouched (no CSP, no buffering)")
  async api() {
    const port = 41956;
    const app = Application();
    app.use(cspMiddleware());
    app.get("/api", () => Response.json({ ok: true }));
    const http = (await listen(app, port)) as unknown as { drain: () => Promise<void> };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api`, { headers: { accept: "application/json" } });
      expect(res.headers.get("content-security-policy")).toBe(null);
      expect((await res.json() as { ok: boolean }).ok).toBe(true);
    } finally {
      await http.drain();
    }
  }

  @Test.it("csp() module installs the middleware via ctx.app.use")
  installs() {
    const used: unknown[] = [];
    const fakeApp = { use: (mw: unknown) => used.push(mw) };
    csp({ reportOnly: true }).setup({ app: fakeApp as never, routes: [], absolute: (p) => p, head() {} });
    expect(used.length).toBe(1);
    expect(typeof used[0]).toBe("function");
  }
}

await TestApplication()
  .addTests(CspUnitSuite, CspIntegrationSuite)
  .reporter(new ConsoleReporter())
  .run();
