// SSR domain over devtools-protocol. Run: pnpm --filter @youneed/server-plugin-ssr test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createTarget, createClient, inProcessTransport } from "@youneed/devtools-protocol";
import { ssrDomain, type SsrInspect } from "../src/protocol.ts";

const inspect: SsrInspect = { kind: "ssr", origin: "https://x.dev", pages: 3, modules: [{ name: "sitemap", info: { entries: 5 } }, { name: "robots" }] };

function wire() {
  const { a, b } = inProcessTransport();
  createTarget({ kind: "server", title: "site" }).register(ssrDomain(() => inspect)).serve(b);
  return createClient(a);
}

class SsrProtocolSuite extends Test({ name: "server-plugin-ssr · protocol" }) {
  @Test.it("SSR.get returns the inspect payload") async get() {
    const c = wire();
    const r = await c.command<SsrInspect>("SSR.get");
    expect(r.pages).toBe(3);
    expect(r.origin).toBe("https://x.dev");
  }
  @Test.it("SSR.getModules lists satellite modules") async modules() {
    const c = wire();
    const mods = await c.command<Array<{ name: string }>>("SSR.getModules");
    expect(mods.map((m) => m.name)).toEqual(["sitemap", "robots"]);
  }
  @Test.it("Target advertises SSR domain") async info() {
    const c = wire();
    expect((await c.getInfo()).domains.includes("SSR")).toBeTruthy();
  }
}

await TestApplication().addTests(SsrProtocolSuite).reporter(new ConsoleReporter()).run();
