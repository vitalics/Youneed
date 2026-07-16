// Run: pnpm --filter @youneed/server-plugin-kv test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { MemoryKV, TrackedKV, createKV, kv, type KvInspect } from "../src/index.ts";

class KvSuite extends Test({ name: "server-plugin-kv" }) {
  #server!: HTTP;
  store = createKV(); // TrackedKV over MemoryKV
  base = "http://127.0.0.1:41320";

  @Test.beforeAll() async start() {
    const app = Application().plugin(kv(this.store));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41320, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("TrackedKV: delegates ops to the backend") async delegate() {
    const store = new TrackedKV(new MemoryKV());
    await store.set("a", "1");
    expect(await store.get("a")).toBe("1");
    await store.delete("a");
    expect(await store.get("a")).toBe(undefined);
  }

  @Test.it("TrackedKV: counts ops + hit/miss") async counts() {
    const store = new TrackedKV(new MemoryKV(), { recent: 3 });
    await store.set("k", "v");
    await store.get("k"); // hit
    await store.get("nope"); // miss
    const s = store.stats();
    expect(s.sets === 1 && s.gets === 2 && s.hits === 1 && s.misses === 1).toBeTruthy();
    // ring buffer caps at 3
    await store.get("k");
    await store.get("k");
    expect(store.recent().length).toBe(3);
  }

  @Test.it("inspect(): kind=kv with stats + endpoints") inspect() {
    const plugin = kv(this.store);
    const info = plugin.inspect!() as KvInspect;
    expect(info.kind === "kv" && info.backend === "memory" && info.scannable === true).toBeTruthy();
    expect(typeof info.endpoints.keys === "string" && typeof info.endpoints.set === "string").toBeTruthy();
  }

  @Test.it("routes: set → get → keys → delete round-trip") async routes() {
    const set = await fetch(`${this.base}/__kv/set`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "user:1", value: "Ada", ttl: 60 }),
    });
    expect(set.ok).toBeTruthy();

    const got = (await (await fetch(`${this.base}/__kv/get?key=user:1`)).json()) as { value: string; ttl: number };
    expect(got.value).toBe("Ada");
    expect(got.ttl > 0).toBeTruthy();

    const keys = (await (await fetch(`${this.base}/__kv/keys?prefix=user:`)).json()) as { keys: Array<{ key: string }> };
    expect(keys.keys.some((k) => k.key === "user:1")).toBeTruthy();

    const del = await fetch(`${this.base}/__kv/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "user:1" }),
    });
    expect(del.ok).toBeTruthy();

    const gone = (await (await fetch(`${this.base}/__kv/get?key=user:1`)).json()) as { value: string | null };
    expect(gone.value).toBe(null);
  }

  @Test.it("routes: set rejects a missing value") async validation() {
    const res = await fetch(`${this.base}/__kv/set`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "x" }),
    });
    await res.body?.cancel();
    expect(res.status).toBe(400);
  }

  @Test.it("topology().plugins exposes inspect() with kind 'kv'") topologyInspect() {
    const app = Application().plugin(kv(createKV()));
    const entry = app.topology().plugins.find((p) => p.name === "kv");
    const info = entry?.info as { kind: string; endpoints: { set: string } } | undefined;
    expect(info?.kind === "kv" && info.endpoints.set === "/__kv/set").toBeTruthy();
  }
}

await TestApplication().addTests(KvSuite).reporter(new ConsoleReporter()).run();
