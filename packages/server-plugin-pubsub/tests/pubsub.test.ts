// Run: pnpm --filter @youneed/server-plugin-pubsub test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { MemoryPubSub, TrackedPubSub, createPubSub, pubsub } from "../src/index.ts";

class PubSubSuite extends Test({ name: "server-plugin-pubsub" }) {
  #server!: HTTP;
  bus = createPubSub(); // TrackedPubSub over MemoryPubSub
  base = "http://127.0.0.1:41310";

  @Test.beforeAll() async start() {
    const app = Application().plugin(pubsub(this.bus));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41310, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("MemoryPubSub: subscriber receives published messages") async deliver() {
    const bus = new MemoryPubSub();
    const got: string[] = [];
    const sub = await bus.subscribe("orders", (m, ch) => void got.push(`${ch}:${m}`));
    await bus.publish("orders", "a");
    await bus.publish("other", "x"); // no subscriber
    await bus.publish("orders", "b");
    await sub.close();
    await bus.publish("orders", "c"); // after close → ignored
    expect(got.length === 2 && got[0] === "orders:a" && got[1] === "orders:b").toBeTruthy();
  }

  @Test.it("TrackedPubSub: counts publishes/deliveries + ring buffer") async tracked() {
    const bus = new TrackedPubSub(new MemoryPubSub(), { recent: 2 });
    await bus.subscribe("c", () => {});
    await bus.publish("c", "1");
    await bus.publish("c", "2");
    await bus.publish("c", "3");
    const stat = bus.channels().find((s) => s.channel === "c")!;
    expect(stat.published === 3 && stat.delivered === 3 && stat.subscribers === 1 && stat.recent.length === 2 && stat.recent[0].message === "2").toBeTruthy();
  }

  @Test.it("plugin: POST /__pubsub/publish delivers to subscribers") async pluginPublish() {
    const got: string[] = [];
    await this.bus.subscribe("devtools-chan", (m) => void got.push(m));
    const r = await fetch(`${this.base}/__pubsub/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "devtools-chan", message: "hello from devtools" }),
    });
    const b = (await r.json()) as { ok: boolean };
    expect(r.status === 200 && b.ok && got[0] === "hello from devtools").toBeTruthy();
  }

  @Test.it("plugin: GET /__pubsub/channels reports activity") async pluginChannels() {
    const r = await fetch(`${this.base}/__pubsub/channels`);
    const b = (await r.json()) as { backend: string; channels: { channel: string; published: number }[] };
    const chan = b.channels.find((c) => c.channel === "devtools-chan");
    expect(b.backend === "memory" && !!chan && chan.published >= 1).toBeTruthy();
  }

  @Test.it("plugin: bad publish body → 400") async pluginBad() {
    const r = await fetch(`${this.base}/__pubsub/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: "x" }) });
    await r.body?.cancel();
    expect(r.status).toBe(400);
  }

  @Test.it("plugin: topology().plugins exposes inspect() with kind 'pubsub'") topologyInspect() {
    const app = Application().plugin(pubsub(createPubSub()));
    const top = app.topology();
    const entry = top.plugins.find((p) => p.name === "pubsub");
    const info = entry?.info as { kind: string; endpoints: { publish: string } } | undefined;
    expect(info?.kind === "pubsub" && info.endpoints.publish === "/__pubsub/publish").toBeTruthy();
  }
}

await TestApplication().addTests(PubSubSuite).reporter(new ConsoleReporter()).run();
