// Run: pnpm --filter @youneed/server-middleware-accept-language test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { acceptLanguage, negotiateLanguage, parseAcceptLanguage } from "../src/index.ts";

class AcceptLanguageSuite extends Test({ name: "server-middleware-accept-language" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41280";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(acceptLanguage({ supported: ["en", "de", "fr"], default: "en" }))
      .get("/", (ctx) => Response.json({ locale: ctx.state.locale }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41280, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  // ── pure parsing / negotiation ───────────────────────────────────────────────
  @Test.it("parses + sorts by quality") parse() {
    const p = parseAcceptLanguage("fr;q=0.5, en, de;q=0.8");
    expect(p.map((w) => w.tag).join(",")).toBe("en,de,fr");
  }

  @Test.it("exact tag beats primary fallback") exact() {
    expect(negotiateLanguage("de-AT,de;q=0.9", ["de", "de-AT"])).toBe("de-AT");
  }

  @Test.it("falls back on the primary subtag (de-CH → de)") primary() {
    expect(negotiateLanguage("de-CH", ["en", "de"])).toBe("de");
  }

  @Test.it("respects quality order") quality() {
    expect(negotiateLanguage("de;q=0.7, fr;q=0.9", ["de", "fr"])).toBe("fr");
  }

  @Test.it("q=0 rejects a tag") reject() {
    expect(negotiateLanguage("de;q=0, en", ["de", "en"])).toBe("en");
  }

  @Test.it("* maps to the first supported locale") wildcard() {
    expect(negotiateLanguage("*", ["en", "de"])).toBe("en");
  }

  @Test.it("no match → undefined") none() {
    expect(negotiateLanguage("es", ["en", "de"])).toBeUndefined();
  }

  // ── middleware end-to-end ──────────────────────────────────────────────────────
  @Test.it("negotiates from the header + sets Content-Language") negotiate() {
    return fetch(`${this.base}/`, { headers: { "accept-language": "de-CH,de;q=0.9,en;q=0.1" } }).then(
      async (r) => {
        const b = (await r.json()) as { locale: string };
        expect(b.locale).toBe("de");
        expect(r.headers.get("content-language")).toBe("de");
        expect((r.headers.get("vary") ?? "").toLowerCase().includes("accept-language")).toBeTruthy();
      },
    );
  }

  @Test.it("falls back to default with no header") fallback() {
    return fetch(`${this.base}/`).then(async (r) => {
      const b = (await r.json()) as { locale: string };
      expect(b.locale).toBe("en");
    });
  }
}

await TestApplication().addTests(AcceptLanguageSuite).reporter(new ConsoleReporter()).run();
