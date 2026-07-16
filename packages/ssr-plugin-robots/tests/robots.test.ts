import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { SsrModuleContext, SsrRoute } from "@youneed/server-plugin-ssr";
import { buildRobots, robots } from "../src/index.ts";

// A minimal stub SsrModuleContext — robots only reads `origin`/`absolute`.
function ctx(origin?: string, routes: SsrRoute[] = []): SsrModuleContext {
  return {
    app: {} as never,
    origin,
    routes,
    absolute: (p) =>
      /^[a-z]+:\/\//i.test(p) || !origin ? p : origin.replace(/\/+$/, "") + "/" + p.replace(/^\/+/, ""),
    head: () => {},
  };
}

class RobotsSuite extends Test({ name: "robots" }) {
  @Test.it("default = allow everything")
  default() {
    const out = buildRobots({}, ctx());
    expect(out).toContain("User-agent: *");
    expect(out).toContain("Disallow:");
  }

  @Test.it("per-agent allow/disallow + crawl-delay")
  policies() {
    const out = buildRobots(
      {
        policies: [
          { userAgent: "*", disallow: ["/admin", "/api"], allow: "/api/public" },
          { userAgent: ["GPTBot", "CCBot"], disallow: "/", crawlDelay: 10 },
        ],
      },
      ctx(),
    );
    expect(out).toContain("Disallow: /admin");
    expect(out).toContain("Allow: /api/public");
    expect(out).toContain("User-agent: GPTBot");
    expect(out).toContain("User-agent: CCBot");
    expect(out).toContain("Crawl-delay: 10");
  }

  @Test.it("sitemap: true → absolute /sitemap.xml; host")
  sitemap() {
    const out = buildRobots({ sitemap: true, host: "example.com" }, ctx("https://example.com"));
    expect(out).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(out).toContain("Host: example.com");
  }

  @Test.it("module reports name/path")
  module() {
    const m = robots({ path: "/robots.txt" });
    expect(m.name).toBe("robots");
    expect((m.inspect?.() as { path: string }).path).toBe("/robots.txt");
  }
}

await TestApplication().addTests(RobotsSuite).reporter(new ConsoleReporter()).run();
