// Run: pnpm --filter @youneed/server-plugin-pubsub-deno test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { DenoKV, DenoPubSub, type DenoKvLike } from "../src/index.ts";

// An in-memory fake of Deno.Kv (get/set/delete/list/atomic + queue).
function fakeDenoKv(): DenoKvLike {
  const store = new Map<string, { value: unknown; versionstamp: string }>();
  let version = 0;
  const queueHandlers: Array<(v: unknown) => void | Promise<void>> = [];
  const k = (key: unknown[]) => JSON.stringify(key);
  const kv: DenoKvLike = {
    async get(key) {
      const e = store.get(k(key));
      return e ? { value: e.value, versionstamp: e.versionstamp } : { value: null, versionstamp: null };
    },
    async set(key, value) {
      store.set(k(key), { value, versionstamp: String(++version) });
      return { ok: true };
    },
    async delete(key) {
      store.delete(k(key));
    },
    async *list(selector) {
      const prefix = k(selector.prefix).slice(0, -1); // drop closing ]
      for (const [key, e] of store) if (key.startsWith(prefix)) yield { key: JSON.parse(key), value: e.value };
    },
    atomic() {
      const checks: { key: unknown[]; versionstamp: string | null }[] = [];
      const sets: Array<{ key: unknown[]; value: unknown }> = [];
      const op = {
        check(...c: { key: unknown[]; versionstamp: string | null }[]) {
          checks.push(...c);
          return op;
        },
        set(key: unknown[], value: unknown) {
          sets.push({ key, value });
          return op;
        },
        async commit() {
          for (const c of checks) {
            const cur = store.get(k(c.key));
            const vs = cur?.versionstamp ?? null;
            if (vs !== c.versionstamp) return { ok: false };
          }
          for (const s of sets) store.set(k(s.key), { value: s.value, versionstamp: String(++version) });
          return { ok: true };
        },
      };
      return op as unknown as ReturnType<DenoKvLike["atomic"]>;
    },
    async enqueue(value) {
      queueMicrotask(() => {
        for (const h of queueHandlers) void h(value);
      });
      return { ok: true };
    },
    listenQueue(handler) {
      queueHandlers.push(handler);
    },
  };
  return kv;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

class DenoSuite extends Test({ name: "server-plugin-pubsub-deno" }) {
  @Test.it("KV: set/get, incr (atomic), ttl, scan") async kv() {
    const kv = new DenoKV({ kv: fakeDenoKv() });
    await kv.set("a", "1");
    const a = await kv.incr("a");
    const c1 = await kv.incr("counter", { by: 5 });
    const c2 = await kv.incr("counter");
    await kv.set("k", "v", { ttl: 100 });
    const ttl = await kv.ttl("k");
    const keys = await kv.scan("c");
    // "a" started as "1" then incr → "2"
    expect(a === 2 && c1 === 5 && c2 === 6 && ttl > 0 && ttl <= 100 && keys.includes("counter")).toBeTruthy();
  }

  @Test.it("PubSub: enqueue/listenQueue delivers to the channel's subscribers") async pubsub() {
    const fake = fakeDenoKv();
    const bus = new DenoPubSub({ kv: fake });
    const got: string[] = [];
    await bus.subscribe("mail", (m, ch) => void got.push(`${ch}:${m}`));
    await bus.publish("mail", "welcome");
    await bus.publish("other", "ignored"); // no subscriber for this channel
    await tick();
    expect(got.length === 1 && got[0] === "mail:welcome").toBeTruthy();
  }
}

await TestApplication().addTests(DenoSuite).reporter(new ConsoleReporter()).run();
