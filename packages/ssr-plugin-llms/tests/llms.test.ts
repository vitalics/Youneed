import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { SsrModuleContext, SsrRoute } from "@youneed/server-plugin-ssr";
import { buildLlms } from "../src/index.ts";

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

class LlmsSuite extends Test({ name: "llms" }) {
  @Test.it("title + summary + sections")
  basic() {
    const out = buildLlms(
      {
        title: "Example",
        summary: "A demo site.",
        notes: ["Note one."],
        sections: [{ title: "Docs", links: [{ title: "API", url: "/docs/api", notes: "REST" }] }],
      },
      ctx(),
    );
    expect(out).toContain("# Example");
    expect(out).toContain("> A demo site.");
    expect(out).toContain("Note one.");
    expect(out).toContain("## Docs");
    expect(out).toContain("- [API](https://example.com/docs/api): REST");
  }

  @Test.it("includePages appends static routes, skips dynamic")
  pages() {
    const routes: SsrRoute[] = [
      { url: "/", title: "Home", dynamic: false },
      { url: "/users/:id", dynamic: true },
    ];
    const out = buildLlms({ title: "X", includePages: "Site" }, ctx(routes));
    expect(out).toContain("## Site");
    expect(out).toContain("- [Home](https://example.com/)");
    expect(out).not.toContain("/users/:id");
  }
}

await TestApplication().addTests(LlmsSuite).reporter(new ConsoleReporter()).run();
