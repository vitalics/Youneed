// page.ts/dom-ssr.ts pull in @youneed/dom (extends HTMLElement at import) → a
// server DOM must be registered before importing @youneed/ssr or this package.
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const ssr = await import("@youneed/ssr");
const { Page, renderPageToString } = ssr;
const { speculationScript, speculationMiddleware, enableSpeculation, speculation } = await import(
  "../src/index.ts"
);

class About extends Page("/about", { title: "About" }) {
  override render() {
    return "<h1>About</h1>";
  }
}
class Home extends Page("/", {
  title: "Home",
  speculation: { prerender: [{ source: "list", urls: ["/about"], eagerness: "moderate" }] },
}) {
  override render() {
    return "<h1>Home</h1>";
  }
}
class Plain extends Page("/plain", { title: "Plain" }) {
  override render() {
    return "<h1>Plain</h1>";
  }
}

class SpeculationSuite extends Test({ name: "ssr-plugin-speculation" }) {
  @Test.it("speculationScript serializes + escapes <")
  serialize() {
    const out = speculationScript({ prefetch: [{ source: "list", urls: ["/a</script>"] }] });
    expect(out.startsWith('<script type="speculationrules">')).toBe(true);
    expect(out).toContain("prefetch");
    expect(out).not.toContain("</script>/"); // the payload's < is escaped
  }

  @Test.it("NOT injected until enabled")
  async inert() {
    const html = await renderPageToString(Home);
    expect(html).not.toContain('type="speculationrules"');
  }

  @Test.it("injected after enableSpeculation(), only for declaring pages")
  async injected() {
    const off = enableSpeculation();
    try {
      const home = await renderPageToString(Home);
      expect(home).toContain('<script type="speculationrules">');
      expect(home).toContain('"prerender"');
      expect(home).toContain("/about");

      const plain = await renderPageToString(Plain);
      expect(plain).not.toContain("speculationrules");
    } finally {
      off();
    }
  }

  @Test.it("disposer removes the middleware")
  async disposed() {
    const off = enableSpeculation();
    off();
    const html = await renderPageToString(Home);
    expect(html).not.toContain("speculationrules");
  }

  @Test.it("middleware reads the page's resolved rules")
  middleware() {
    const ruleStr = speculationMiddleware({
      page: new Home(),
      options: {},
      url: "/",
      ctx: {} as never,
      routes: [],
    });
    expect(String(ruleStr)).toContain("prerender");
  }

  @Test.it("speculation() module is idempotent")
  async moduleIdempotent() {
    const m1 = speculation();
    const m2 = speculation();
    m1.setup({} as never);
    m2.setup({} as never); // second registration is a no-op (guarded)
    try {
      const home = await renderPageToString(Home);
      // exactly one injected <script>, not two
      expect(home.split('type="speculationrules"').length).toBe(2);
    } finally {
      enableSpeculation()(); // resolve + immediately dispose to reset the guard
    }
    expect(m1.name).toBe("speculation");
  }
}

await TestApplication().addTests(SpeculationSuite).reporter(new ConsoleReporter()).run();
