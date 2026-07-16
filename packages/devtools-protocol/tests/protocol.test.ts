// Run: pnpm --filter @youneed/devtools-protocol test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { t } from "@youneed/schema";
import {
  createTarget,
  createClient,
  defineDomain,
  inProcessTransport,
  type DomainContext,
} from "../src/index.ts";

// A demo domain: a command with a typed param + an event push.
const Counter = defineDomain({
  domain: "Counter",
  description: "demo",
  commands: {
    add: {
      description: "add two ints",
      params: t.int(), // single positional param schema (the increment)
      result: t.int(),
      handler(by: number, ctx: DomainContext) {
        const next = ((ctx.session.value as number) ?? 0) + by;
        ctx.session.value = next;
        ctx.emit("changed", { value: next }); // → "Counter.changed"
        return next;
      },
    },
  },
  events: { changed: { params: t.int() } },
});

function wire() {
  const { a, b } = inProcessTransport();
  const target = createTarget({ kind: "server", title: "demo", id: "t1" }).register(Counter);
  const detach = target.serve(b);
  const client = createClient(a);
  return { client, target, detach };
}

class ProtocolSuite extends Test({ name: "devtools-protocol" }) {
  @Test.it("command → result, with per-session state") async command() {
    const { client } = wire();
    expect(await client.command("Counter.add", 3)).toBe(3);
    expect(await client.command("Counter.add", 4)).toBe(7); // session state persists
  }

  @Test.it("event push reaches a subscribed client") async event() {
    const { client } = wire();
    const seen: unknown[] = [];
    client.on("Counter.changed", (p) => seen.push(p));
    await client.command("Counter.add", 5);
    expect(seen).toEqual([{ value: 5 }]);
  }

  @Test.it("wildcard subscription Domain.*") async wildcard() {
    const { client } = wire();
    let got: any;
    client.on("Counter.*", (p) => (got = p));
    await client.command("Counter.add", 2);
    expect(got.value).toBe(2);
  }

  @Test.it("unknown method → -32601 (rejects)") async notFound() {
    const { client } = wire();
    let code = 0;
    await client.command("Counter.nope").catch((e) => (code = e.code));
    expect(code).toBe(-32601);
  }

  @Test.it("bad params → -32602") async badParams() {
    const { client } = wire();
    let code = 0;
    await client.command("Counter.add", "not-an-int").catch((e) => (code = e.code));
    expect(code).toBe(-32602);
  }

  @Test.it("Target.getInfo advertises domains (+ built-ins)") async info() {
    const { client } = wire();
    const info = await client.getInfo();
    expect(info.kind).toBe("server");
    expect(info.domains.includes("Counter")).toBeTruthy();
    expect(info.domains.includes("Protocol")).toBeTruthy();
  }

  @Test.it("Protocol.getDomains self-description (schema → JSON Schema)") async discover() {
    const { client } = wire();
    const spec = await client.getDomains();
    const d = spec.domains.find((x) => x.domain === "Counter")!;
    expect(d.commands[0].name).toBe("add");
    expect(d.commands[0].params!.type).toBe("integer");
    expect(d.commands[0].result!.type).toBe("integer");
    expect(d.events[0].name).toBe("changed");
  }

  @Test.it("dispatch() works without a transport (events dropped)") async direct() {
    const target = createTarget({ kind: "cli" }).register(Counter);
    const res = await target.dispatch({ id: 1, method: "Counter.add", params: 10 });
    expect(res.result).toBe(10);
    expect(res.id).toBe(1);
  }
}

await TestApplication().addTests(ProtocolSuite).reporter(new ConsoleReporter()).run();
