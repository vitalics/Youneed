// Page devtools "Plugins" tab — the SSR module list. Renders the embedded
// payload's `modules`: endpoint modules (robots/sitemap/rss/llms) as live links,
// the rest as document-head entries.
// Run: pnpm --filter @youneed/devtools test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const dom = await import("@youneed/dom");
const { pluginsPanel, pageDevtoolsPanels } = await import("../src/page-devtools.ts");

function withPayload(modules: unknown[]): void {
  document.querySelector("script[data-page-devtools]")?.remove();
  const script = document.createElement("script");
  script.setAttribute("data-page-devtools", "");
  script.textContent = JSON.stringify({ page: { url: "/" }, routes: [], modules });
  document.body.appendChild(script);
}

function renderPlugins(): { text: string; links: string[] } {
  const panel = pluginsPanel();
  const container = document.createElement("div");
  document.body.appendChild(container);
  panel.render(container, {} as never);
  dom.flushSync();
  const el = container.querySelector("dt-plugins")!;
  const root = (el as unknown as { shadowRoot: ShadowRoot }).shadowRoot;
  return {
    text: root.textContent ?? "",
    links: [...root.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? ""),
  };
}

class PluginsTabSuite extends Test({ name: "page-devtools: Plugins tab" }) {
  @Test.it("is included in the SSR panel set")
  included() {
    expect(pageDevtoolsPanels().some((p) => p.id === "plugins")).toBe(true);
  }

  @Test.it("renders endpoint modules (robots/sitemap/llms) as live links")
  endpoints() {
    withPayload([
      { name: "robots", info: { kind: "robots", path: "/robots.txt" } },
      { name: "sitemap", info: { kind: "sitemap", path: "/sitemap.xml", includePages: true } },
      { name: "llms", info: { kind: "llms", path: "/llms.txt" } },
    ]);
    const { text, links } = renderPlugins();
    expect(text.includes("robots")).toBe(true);
    expect(links.includes("/robots.txt")).toBe(true);
    expect(links.includes("/sitemap.xml")).toBe(true);
    expect(links.includes("/llms.txt")).toBe(true);
  }

  @Test.it("lists document-head modules (meta/speculation) without links")
  headModules() {
    withPayload([
      { name: "meta", info: { kind: "meta" } },
      { name: "speculation", info: { kind: "speculation" } },
      { name: "robots", info: { kind: "robots", path: "/robots.txt" } },
    ]);
    const { text, links } = renderPlugins();
    expect(text.includes("meta")).toBe(true);
    expect(text.includes("speculation")).toBe(true);
    expect(links).toEqual(["/robots.txt"]); // only the endpoint is a link
  }

  @Test.it("shows an empty hint when there are no modules")
  empty() {
    withPayload([]);
    expect(renderPlugins().text.toLowerCase().includes("none")).toBe(true);
  }
}

await TestApplication().addTests(PluginsTabSuite).reporter(new ConsoleReporter()).run();
