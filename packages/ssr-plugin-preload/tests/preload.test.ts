import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const ssr = await import("@youneed/ssr");
const { Page, renderPageToString } = ssr;
const { preload, hintLink } = await import("../src/index.ts");

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

class Home extends Page("/", {
  preload: [
    { rel: "preload", href: "/fonts/inter.woff2", as: "font", type: "font/woff2", crossorigin: true },
    { rel: "modulepreload", href: "/client.js" },
  ],
}) {
  override render() {
    return "<h1>Home</h1>";
  }
}

class PreloadSuite extends Test({ name: "ssr-plugin-preload" }) {
  @Test.it("hintLink: preload resolves absolute + crossorigin")
  unit() {
    const out = hintLink(
      { rel: "preload", href: "/a.woff2", as: "font", type: "font/woff2", crossorigin: true },
      ssrCtx(),
    );
    expect(out).toContain('rel="preload"');
    expect(out).toContain('href="https://example.com/a.woff2"');
    expect(out).toContain('as="font"');
    expect(out).toContain('crossorigin="anonymous"');
  }

  @Test.it("hintLink: preconnect uses the origin verbatim")
  preconnect() {
    const out = hintLink({ rel: "preconnect", href: "https://cdn.example.com" }, ssrCtx());
    expect(out).toContain('rel="preconnect"');
    expect(out).toContain('href="https://cdn.example.com"');
  }

  @Test.it("emits site-wide + per-page hints")
  async render() {
    preload({ hints: [{ rel: "preconnect", href: "https://cdn.example.com" }] }).setup(ssrCtx());
    const html = await renderPageToString(Home);
    expect(html).toContain('<link rel="preconnect" href="https://cdn.example.com">');
    expect(html).toContain('<link rel="preload" href="https://example.com/fonts/inter.woff2" as="font"');
    expect(html).toContain('<link rel="modulepreload" href="https://example.com/client.js">');
  }
}

await TestApplication().addTests(PreloadSuite).reporter(new ConsoleReporter()).run();
