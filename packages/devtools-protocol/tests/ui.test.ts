// UI extension registry + built-in extensions. happy-dom first (html touches DOM).
// Run: pnpm --filter @youneed/devtools-protocol test
import { registerDOM } from "@youneed/dom/register";
registerDOM();

import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

const { createTarget, createClient, inProcessTransport, defineDomain } = await import("../src/index.ts");
const { extensionsFor, getExtension } = await import("../src/ui.ts");
await import("../src/extensions.ts"); // registers Topology/Components/SSR/CLI
type Domain = ReturnType<typeof defineDomain>;

// A fake Topology domain (the built-in extension talks to it purely via the client).
const Topology: Domain = defineDomain({
  domain: "Topology",
  commands: {
    get: { handler: () => ({ name: "api", routes: [{ method: "GET", path: "/x", controller: "X" }] }) },
    grade: { handler: () => "pass" },
  },
});
const SSR: Domain = defineDomain({ domain: "SSR", commands: { get: { handler: () => ({ pages: 0, modules: [] }) } } });

function wire(domains: Domain[]) {
  const { a, b } = inProcessTransport();
  const target = createTarget({ kind: "server", title: "api" }).register(...domains);
  target.serve(b);
  return { client: createClient(a), info: target.info() };
}

class UiSuite extends Test({ name: "devtools-protocol · ui" }) {
  @Test.it("extensionsFor filters to advertised + labelled domains") info() {
    const { info } = wire([Topology]);
    const exts = extensionsFor(info);
    expect(exts.some((e) => e.domain === "Topology")).toBeTruthy();
    expect(exts.some((e) => e.domain === "Components")).toBeFalsy(); // not advertised
  }

  @Test.it("built-in Topology panel renders via the live client") async panel() {
    const { client, info } = wire([Topology]);
    const ext = getExtension("Topology")!;
    const view = await ext.panel!({ client, target: info, goto: () => {}, refresh: () => {} });
    expect(!!view).toBeTruthy();
  }

  @Test.it("extensions are ordered by `order`") order() {
    const { info } = wire([Topology, SSR]);
    const order = extensionsFor(info).map((e) => e.domain);
    expect(order.indexOf("Topology")).toBeLessThan(order.indexOf("SSR"));
  }
}

await TestApplication().addTests(UiSuite).reporter(new ConsoleReporter()).run();
