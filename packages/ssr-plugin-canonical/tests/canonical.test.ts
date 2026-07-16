import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const ssr = await import("@youneed/ssr");
const { Page, renderPageToString } = ssr;
const { canonical } = await import("../src/index.ts");

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

class Pricing extends Page("/pricing", {
  alternates: [{ hreflang: "de", href: "/de/preise" }],
}) {
  override render() {
    return "<h1>Pricing</h1>";
  }
}
class Custom extends Page("/x", { canonical: "/canonical-target" }) {
  override render() {
    return "<h1>X</h1>";
  }
}
class OptOut extends Page("/private", { canonical: false }) {
  override render() {
    return "<h1>P</h1>";
  }
}

class CanonicalSuite extends Test({ name: "ssr-plugin-canonical" }) {
  @Test.it("inert until set up")
  async inert() {
    expect(await renderPageToString(Pricing)).not.toContain('rel="canonical"');
  }

  @Test.it("auto canonical from page URL + hreflang alternates")
  async auto() {
    canonical().setup(ssrCtx());
    const html = await renderPageToString(Pricing);
    expect(html).toContain('<link rel="canonical" href="https://example.com/pricing">');
    expect(html).toContain('<link rel="alternate" hreflang="de" href="https://example.com/de/preise">');
  }

  @Test.it("explicit canonical string wins")
  async explicit() {
    const html = await renderPageToString(Custom);
    expect(html).toContain('<link rel="canonical" href="https://example.com/canonical-target">');
  }

  @Test.it("canonical: false opts out")
  async optOut() {
    expect(await renderPageToString(OptOut)).not.toContain('rel="canonical"');
  }
}

await TestApplication().addTests(CanonicalSuite).reporter(new ConsoleReporter()).run();
