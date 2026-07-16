import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { SsrModuleContext, SsrRoute } from "@youneed/server-plugin-ssr";
import { buildSitemap, sitemap, type SitemapEntry } from "../src/index.ts";

function ctx(routes: SsrRoute[] = [], origin = "https://example.com"): SsrModuleContext {
  return {
    app: {} as never,
    origin,
    routes,
    absolute: (p) =>
      /^[a-z]+:\/\//i.test(p) ? p : origin.replace(/\/+$/, "") + "/" + p.replace(/^\/+/, ""),
    head: () => {},
  };
}

class SitemapSuite extends Test({ name: "sitemap" }) {
  @Test.it("absolute <loc> + escaped + formatted fields")
  build() {
    const entries: SitemapEntry[] = [
      { url: "/a?x=1&y=2", lastmod: new Date(Date.UTC(2026, 0, 1)), changefreq: "weekly", priority: 0.5 },
    ];
    const xml = buildSitemap(entries, ctx());
    expect(xml).toContain("<loc>https://example.com/a?x=1&amp;y=2</loc>");
    expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
    expect(xml).toContain("<priority>0.5</priority>");
  }

  @Test.it("module excludes dynamic routes + honors exclude")
  async collectRoutes() {
    const routes: SsrRoute[] = [
      { url: "/", dynamic: false },
      { url: "/about", dynamic: false },
      { url: "/users/:id", dynamic: true },
      { url: "/admin", dynamic: false },
    ];
    const captured: string[] = [];
    const fakeApp = {
      get(_path: string, handler: () => unknown) {
        // run the handler to capture the produced XML body
        Promise.resolve(handler()).then((r) => captured.push((r as { body: string }).body));
      },
    };
    const c = { ...ctx(routes), app: fakeApp as never };
    const m = sitemap({ exclude: ["/admin"] });
    m.setup(c);
    await Promise.resolve();
    await Promise.resolve();
    const xml = captured[0];
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).not.toContain("/users/:id");
    expect(xml).not.toContain("/admin");
  }
}

await TestApplication().addTests(SitemapSuite).reporter(new ConsoleReporter()).run();
