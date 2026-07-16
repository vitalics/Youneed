// Components domain over devtools-protocol (in-process transport). happy-dom is
// registered first because core.ts touches DOM globals at load.
// Run: pnpm --filter @youneed/devtools test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { installDevtools, clearDevtools } = await import("../src/core.ts");
const { createComponentsTarget } = await import("../src/protocol.ts");
const { createClient, inProcessTransport } = await import("@youneed/devtools-protocol");

interface Hook {
  send(e: Record<string, unknown>): void;
}
installDevtools();
const hook = (globalThis as { __DOM_DEVTOOLS__?: Hook }).__DOM_DEVTOOLS__!;

function wire() {
  clearDevtools();
  const { a, b } = inProcessTransport();
  createComponentsTarget({ id: "page-1", title: "Checkout" }).serve(b);
  return createClient(a);
}

class ComponentsProtocolSuite extends Test({ name: "devtools-protocol · Components" }) {
  @Test.it("getTree reflects the live store") async getTree() {
    const client = wire();
    expect((await client.command<unknown[]>("Components.getTree")).length).toBe(0);
    hook.send({ kind: "mount", id: 1, tag: "x-root", time: 0, props: { a: 1 } });
    const tree = await client.command<Array<{ id: number; tag: string }>>("Components.getTree");
    expect(tree.length).toBe(1);
    expect(tree[0].tag).toBe("x-root");
  }

  @Test.it("getComponent by id (+ strips elRef)") async getComponent() {
    const client = wire();
    hook.send({ kind: "mount", id: 7, tag: "x-card", time: 0, props: { n: 5 } });
    const c = await client.command<{ tag: string; elRef?: unknown } | null>("Components.getComponent", 7);
    expect(c?.tag).toBe("x-card");
    expect("elRef" in (c as object)).toBeFalsy();
  }

  @Test.it("enable → Components.changed event on store mutation") async event() {
    const client = wire();
    const seen: any[] = [];
    client.on("Components.changed", (p) => seen.push(p));
    await client.command("Components.enable");
    hook.send({ kind: "mount", id: 9, tag: "x-row", time: 0, props: {} });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1).components.some((c: { id: number }) => c.id === 9)).toBeTruthy();
  }

  @Test.it("disable stops events") async disable() {
    const client = wire();
    const seen: any[] = [];
    client.on("Components.changed", (p) => seen.push(p));
    await client.command("Components.enable");
    await client.command("Components.disable");
    hook.send({ kind: "mount", id: 11, tag: "x-x", time: 0, props: {} });
    expect(seen.length).toBe(0);
  }

  @Test.it("Target.getInfo advertises the Components domain") async info() {
    const client = wire();
    const info = await client.getInfo();
    expect(info.kind).toBe("dom");
    expect(info.domains.includes("Components")).toBeTruthy();
  }
}

await TestApplication().addTests(ComponentsProtocolSuite).reporter(new ConsoleReporter()).run();
