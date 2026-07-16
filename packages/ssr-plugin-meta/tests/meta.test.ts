// Needs a server DOM (page.ts pulls @youneed/dom) → register, then dynamic-import.
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const ssr = await import("@youneed/ssr");
const { Page, renderPageToString } = ssr;
const { meta } = await import("../src/index.ts");

// Minimal SsrModuleContext to drive setup() (registers the page middleware).
function ssrCtx(origin = "https://example.com") {
  return {
    app: {} as never,
    origin,
    routes: [],
    head() {},
    absolute: (p: string) =>
      /^[a-z]+:\/\//i.test(p) ? p : origin.replace(/\/+$/, "") + "/" + p.replace(/^\/+/, ""),
  };
}

class Post extends Page("/blog/hello", {
  title: "Hello world",
  meta: {
    description: "An intro post.",
    keywords: ["a", "b"],
    robots: "index,follow",
    og: { type: "article", image: "/og/hello.png" },
  },
}) {
  override render() {
    return "<h1>Hello</h1>";
  }
}
class Bare extends Page("/bare", { title: "Bare" }) {
  override render() {
    return "<h1>Bare</h1>";
  }
}

class MetaSuite extends Test({ name: "ssr-plugin-meta" }) {
  @Test.it("not injected until the module is set up")
  async inert() {
    const html = await renderPageToString(Post);
    expect(html).not.toContain('name="description"');
  }

  @Test.it("emits description/keywords/robots + OG + Twitter")
  async tags() {
    meta({ siteName: "Example", twitterSite: "@ex" }).setup(ssrCtx());
    const html = await renderPageToString(Post);
    expect(html).toContain('<meta name="description" content="An intro post.">');
    expect(html).toContain('<meta name="keywords" content="a, b">');
    expect(html).toContain('<meta name="robots" content="index,follow">');
    expect(html).toContain('<meta property="og:title" content="Hello world">');
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta property="og:image" content="https://example.com/og/hello.png">');
    expect(html).toContain('<meta property="og:url" content="https://example.com/blog/hello">');
    expect(html).toContain('<meta property="og:site_name" content="Example">');
    // image present → large card
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:site" content="@ex">');
    expect(html).toContain('<meta name="twitter:image" content="https://example.com/og/hello.png">');
  }

  @Test.it("a page without meta still gets defaults (site_name, summary card)")
  async defaults() {
    const html = await renderPageToString(Bare);
    expect(html).toContain('<meta property="og:site_name" content="Example">');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).toContain('<meta property="og:title" content="Bare">');
  }
}

await TestApplication().addTests(MetaSuite).reporter(new ConsoleReporter()).run();
