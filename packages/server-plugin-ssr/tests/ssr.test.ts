// Integration test: the ssr() plugin mounts pages, exposes the route table to
// modules, registers their routes, and injects global <head> contributions.
//
// dom.ts/page.ts extend HTMLElement at import → register a server DOM first,
// then dynamically import @youneed/ssr and the plugin.
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { get as httpGet } from "node:http";

// registerDOM() installs happy-dom's fetch (same-origin policy blocks 127.0.0.1),
// so hit the server over node:http instead.
function GET(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    }).on("error", reject);
  });
}

registerDOM();
const { Page } = await import("@youneed/ssr");
const { ssr } = await import("../src/index.ts");
type SsrModule = import("../src/index.ts").SsrModule;

const { getDevtoolsRenderer } = await import("@youneed/server-plugin-devtools/registry");
await import("../src/devtools.ts"); // side-effect: registers the "ssr" renderer

const SSR_INFO = {
  kind: "ssr",
  origin: "https://example.com",
  pages: 2,
  modules: [
    { name: "robots", info: { kind: "robots", path: "/robots.txt", policies: 1, sitemap: true } },
    { name: "structured-data", info: { kind: "structured-data", dynamic: false, types: ["Organization"] } },
  ],
};
const dtCtx = { goto() {}, request: async () => ({}) as never, server: { name: "x", url: "https://example.com", routes: [] } };

class Home extends Page("/", { title: "Home" }) {
  override render() {
    return "<h1>Home</h1>";
  }
}
class About extends Page("/about", { title: "About" }) {
  override render() {
    return "<h1>About</h1>";
  }
}

// An inline SSR module exercising the full contract without extra deps.
function probe(): SsrModule {
  return {
    name: "probe",
    setup(ctx) {
      ctx.app.get("/ping.txt", () => Response.text("pong"));
      // global <head> — observe origin, route table, absolute()
      ctx.head(() => `<meta name="x-routes" content="${ctx.routes.length}">`);
      ctx.head(() => `<link rel="canonical" href="${ctx.absolute("/")}">`);
    },
    inspect() {
      return { kind: "probe" };
    },
  };
}

function listen(app: ReturnType<typeof Application>, port: number): Promise<HTTP> {
  return new Promise((resolve) => {
    const http = app.listen(port, () => resolve(http));
  });
}

class SsrPluginSuite extends Test({ name: "server-plugin-ssr" }) {
  @Test.it("mounts pages + module routes + global head")
  async all() {
    const port = 41931;
    const app = Application().plugin(
      ssr({ origin: "https://example.com", pages: [Home, About], modules: [probe()] }),
    );
    const http = (await listen(app, port)) as unknown as { drain: () => Promise<void> };
    try {
      const base = `http://127.0.0.1:${port}`;

      // Page route from render()
      const home = await GET(`${base}/`);
      expect(home.status).toBe(200);
      expect(home.body).toContain("<title>Home</title>");
      expect(home.body).toContain("<h1>Home</h1>");

      // Module-registered route
      const ping = await GET(`${base}/ping.txt`);
      expect(ping.body).toBe("pong");

      // Global <head> injected into the page (route table size = 2 pages)
      expect(home.body).toContain('<meta name="x-routes" content="2">');
      expect(home.body).toContain('<link rel="canonical" href="https://example.com/">');

      // Other page also mounted
      const about = await GET(`${base}/about`);
      expect(about.body).toContain("<h1>About</h1>");
    } finally {
      await http.drain();
    }
  }

  @Test.it("inspect() reports mounted pages + modules")
  inspect() {
    const plugin = ssr({ pages: [Home], modules: [probe()] });
    const info = plugin.inspect?.() as { kind: string; pages: number; modules: Array<{ name: string }> };
    expect(info.kind).toBe("ssr");
    expect(info.pages).toBe(1);
    expect(info.modules[0].name).toBe("probe");
  }
}

class SsrDevtoolsSuite extends Test({ name: "server-plugin-ssr: devtools" }) {
  @Test.it("registers an 'ssr' renderer with label + surfaces")
  registered() {
    const r = getDevtoolsRenderer("ssr");
    expect(r?.label).toBe("SSR");
    expect(typeof r?.card).toBe("function");
    expect(typeof r?.panel).toBe("function");
    expect(typeof r?.flowNode).toBe("function");
  }

  @Test.it("flowNode summarizes module count")
  flow() {
    const node = getDevtoolsRenderer("ssr")!.flowNode!(SSR_INFO);
    expect(node?.label).toContain("2 module(s)");
    expect((node?.detail as { modules: unknown[] }).modules.length).toBe(2);
  }

  @Test.it("card/panel/drawer render without throwing")
  render() {
    const r = getDevtoolsRenderer("ssr")!;
    expect(r.card!(SSR_INFO, dtCtx as never)).toBeTruthy();
    expect(r.panel!(SSR_INFO, dtCtx as never)).toBeTruthy();
    const node = r.flowNode!(SSR_INFO)!;
    expect(r.drawer!(node.detail, dtCtx as never)).toBeTruthy();
  }
}

await TestApplication().addTests(SsrPluginSuite, SsrDevtoolsSuite).reporter(new ConsoleReporter()).run();
