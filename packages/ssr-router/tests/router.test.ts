import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html } = await import("@youneed/dom");
const { Page, renderPageToString } = await import("@youneed/ssr");
const { Response } = await import("@youneed/server");
const { router, catchAll, outlet } = await import("../src/index.ts");

@Component.define()
class NF extends Component("nf-page") {
  override render() {
    return html`<h1>Not Found 404</h1>`;
  }
}
@Component.define()
class ERR extends Component("err-page") {
  override render() {
    return html`<h1>Boom 500</h1>`;
  }
}
class NotFound extends Page("/404", {}) {
  override render() {
    return NF;
  }
}
class ErrorPage extends Page("/500", {}) {
  override render() {
    return ERR;
  }
}

// A page rendered inside a layout shell with an `outlet()` hole.
class Shelled extends Page("/shelled", {
  layout: `<header>SHELL-NAV</header>${outlet()}<footer>SHELL-FOOT</footer>`,
}) {
  override render() {
    return NF;
  }
}

// Capture the global middleware the module registers via a fake SsrModuleContext.
type Mw = (ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>;
function install(opts: Parameters<typeof router>[0]): Mw {
  let mw: Mw | undefined;
  const fakeCtx = {
    app: { use: (m: Mw) => void (mw = m) },
    routes: [],
    absolute: (p: string) => p,
    head: () => {},
  };
  router(opts).setup(fakeCtx as never);
  return mw!;
}

class RouterSuite extends Test({ name: "ssr-router" }) {
  @Test.it("re-renders a default 404 as the notFound page")
  async notFound() {
    const mw = install({ notFound: NotFound });
    const res = (await mw({}, async () => Response({ status: 404, body: "{}" }))) as { status: number; body: string };
    expect(res.status).toBe(404);
    expect(res.body.includes("Not Found 404")).toBe(true);
  }

  @Test.it("renders the error page when a downstream render throws")
  async error() {
    const mw = install({ error: ErrorPage });
    const res = (await mw({}, async () => {
      throw new Error("kaboom");
    })) as { status: number; body: string };
    expect(res.status).toBe(500);
    expect(res.body.includes("Boom 500")).toBe(true);
  }

  @Test.it("passes successful responses through untouched")
  async passthrough() {
    const mw = install({ notFound: NotFound, error: ErrorPage });
    const ok = Response({ status: 200, body: "home" });
    expect(await mw({}, async () => ok)).toBe(ok);
  }

  @Test.it("rethrows when no error page is configured")
  async rethrow() {
    const mw = install({});
    let caught = "";
    await mw({}, async () => {
      throw new Error("nope");
    }).catch((e: Error) => (caught = e.message));
    expect(caught).toBe("nope");
  }

  @Test.it("catchAll builds a wildcard client route")
  wildcard() {
    expect(catchAll(NF)).toEqual({ path: "*", component: NF });
  }

  @Test.it("layout splices the page body into the outlet, keeping the shell")
  async layoutOutlet() {
    const out = await renderPageToString(Shelled, { url: "/shelled" } as never, []);
    // Shell chrome survives…
    expect(out.includes("SHELL-NAV")).toBe(true);
    expect(out.includes("SHELL-FOOT")).toBe(true);
    // …and the page body lives inside the outlet div (not appended after it).
    expect(/<div data-router-outlet><nf-page/.test(out)).toBe(true);
  }
}

await TestApplication().addTests(RouterSuite).reporter(new ConsoleReporter()).run();
