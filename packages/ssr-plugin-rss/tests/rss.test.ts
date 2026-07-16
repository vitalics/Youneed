import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { SsrModuleContext } from "@youneed/server-plugin-ssr";
import { buildFeed, rss, type RssItem } from "../src/index.ts";

function ctx(origin = "https://example.com"): SsrModuleContext {
  return {
    app: {} as never,
    origin,
    routes: [],
    absolute: (p) =>
      /^[a-z]+:\/\//i.test(p) ? p : origin.replace(/\/+$/, "") + "/" + p.replace(/^\/+/, ""),
    head: () => {},
  };
}

const items: RssItem[] = [
  {
    title: "Hello & welcome",
    link: "/blog/hello",
    description: "First post",
    pubDate: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    categories: ["news"],
  },
];

class RssSuite extends Test({ name: "rss" }) {
  @Test.it("RSS 2.0: channel + absolute item link + escaping")
  rss20() {
    const xml = buildFeed(items, { title: "Blog", description: "Posts", items }, ctx());
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<title>Hello &amp; welcome</title>");
    expect(xml).toContain("<link>https://example.com/blog/hello</link>");
    expect(xml).toContain("<guid>https://example.com/blog/hello</guid>");
    expect(xml).toContain("<category>news</category>");
  }

  @Test.it("Atom: feed/entry + ISO updated")
  atom() {
    const xml = buildFeed(items, { title: "Blog", description: "Posts", format: "atom", items }, ctx());
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<link href="https://example.com/blog/hello"/>');
    expect(xml).toContain("<updated>2026-01-02T03:04:05.000Z</updated>");
  }

  @Test.it("default path depends on format")
  paths() {
    expect((rss({ title: "a", description: "b", items }).inspect?.() as { path: string }).path).toBe("/rss.xml");
    expect(
      (rss({ title: "a", description: "b", format: "atom", items }).inspect?.() as { path: string }).path,
    ).toBe("/atom.xml");
  }
}

await TestApplication().addTests(RssSuite).reporter(new ConsoleReporter()).run();
