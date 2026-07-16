import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { MemoryKV, namespaced } from "../src/index.ts";

class MemoryKVSuite extends Test({ name: "kv: MemoryKV" }) {
  @Test.it("get/set/delete round-trips")
  async getSet() {
    const kv = new MemoryKV({ sweepMs: 0 });
    expect(await kv.get("a")).toBe(undefined);
    await kv.set("a", "1");
    expect(await kv.get("a")).toBe("1");
    await kv.delete("a");
    expect(await kv.get("a")).toBe(undefined);
  }

  @Test.it("ttl expires entries against an injected clock")
  async ttl() {
    let now = 1_000_000;
    const kv = new MemoryKV({ sweepMs: 0, now: () => now });
    await kv.set("k", "v", { ttl: 10 });
    expect(await kv.ttl("k")).toBe(10);
    expect(await kv.get("k")).toBe("v");
    now += 9_000;
    expect(await kv.get("k")).toBe("v"); // still live
    now += 2_000; // 11s elapsed > 10s ttl
    expect(await kv.get("k")).toBe(undefined);
    expect(await kv.ttl("k")).toBe(-2); // missing
  }

  @Test.it("ttl reports -1 for no-expiry, -2 for missing")
  async ttlSpecials() {
    const kv = new MemoryKV({ sweepMs: 0 });
    await kv.set("forever", "x");
    expect(await kv.ttl("forever")).toBe(-1);
    expect(await kv.ttl("nope")).toBe(-2);
  }

  @Test.it("incr is atomic-by-amount and sets ttl only on creation")
  async incr() {
    let now = 0;
    const kv = new MemoryKV({ sweepMs: 0, now: () => now });
    expect(await kv.incr("c", { ttl: 60 })).toBe(1); // created → ttl applies
    expect(await kv.ttl("c")).toBe(60);
    now += 30_000;
    expect(await kv.incr("c", { by: 5 })).toBe(6); // existing → ttl untouched
    expect(await kv.ttl("c")).toBe(30); // 60 - 30 elapsed
  }

  @Test.it("expire sets a new window on an existing key")
  async expire() {
    let now = 0;
    const kv = new MemoryKV({ sweepMs: 0, now: () => now });
    await kv.set("k", "v");
    expect(await kv.ttl("k")).toBe(-1);
    await kv.expire("k", 5);
    expect(await kv.ttl("k")).toBe(5);
  }

  @Test.it("scan returns keys by prefix")
  async scan() {
    const kv = new MemoryKV({ sweepMs: 0 });
    await kv.set("user:1", "a");
    await kv.set("user:2", "b");
    await kv.set("post:1", "c");
    const users = (await kv.scan("user:")).sort();
    expect(users).toEqual(["user:1", "user:2"]);
  }
}

class NamespaceSuite extends Test({ name: "kv: namespaced" }) {
  @Test.it("prefixes keys and isolates two consumers on one backend")
  async isolate() {
    const backend = new MemoryKV({ sweepMs: 0 });
    const a = namespaced(backend, "sess");
    const b = namespaced(backend, "rl");
    await a.set("x", "1");
    await b.set("x", "2");
    expect(await a.get("x")).toBe("1");
    expect(await b.get("x")).toBe("2");
    // Under the hood they live under distinct prefixes.
    expect(await backend.get("sess:x")).toBe("1");
    expect(await backend.get("rl:x")).toBe("2");
  }

  @Test.it("scan strips the namespace from results")
  async scanStrip() {
    const backend = new MemoryKV({ sweepMs: 0 });
    const a = namespaced(backend, "cache");
    await a.set("page:home", "x");
    await a.set("page:about", "y");
    const keys = (await a.scan!("page:")).sort();
    expect(keys).toEqual(["page:about", "page:home"]);
  }
}

await TestApplication().addTests(MemoryKVSuite).addTests(NamespaceSuite).reporter(new ConsoleReporter()).run();
