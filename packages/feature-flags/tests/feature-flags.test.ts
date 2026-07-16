// Run: pnpm --filter @youneed/feature-flags test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createFlags, FeatureFlags, MemorySource, bucket, fromSnapshot, type FlagProvider, type Evaluation } from "../src/index.ts";

class FlagsSuite extends Test({ name: "@youneed/feature-flags" }) {
  @Test.it("returns defaultValue when no rule matches") plain() {
    const f = createFlags([{ key: "beta", defaultValue: false }]);
    const ev = f.evaluate("beta");
    expect(ev.value).toBe(false);
    expect(ev.reason).toBe("DEFAULT");
    expect(f.isEnabled("beta")).toBe(false);
  }

  @Test.it("unknown flag → ERROR reason, falsy value, respects fallback") unknown() {
    const f = createFlags([]);
    expect(f.evaluate("nope").reason).toBe("ERROR");
    expect(f.isEnabled("nope")).toBe(false);
    expect(f.value("nope", {}, "fb")).toBe("fb");
  }

  @Test.it("enabled:false short-circuits to defaultValue (DISABLED)") disabled() {
    const f = createFlags([{ key: "x", enabled: false, defaultValue: true, rollout: 100 }]);
    const ev = f.evaluate("x");
    expect(ev.value).toBe(true); // defaultValue, not the rollout
    expect(ev.reason).toBe("DISABLED");
  }

  @Test.it("attribute targeting — first matching rule wins") targeting() {
    const f = createFlags([
      {
        key: "checkout",
        defaultValue: "control",
        variants: { control: "control", fast: "fast" },
        rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
      },
    ]);
    const pro = f.evaluate("checkout", { targetingKey: "u1", attributes: { plan: "pro" } });
    expect(pro.value).toBe("fast");
    expect(pro.variant).toBe("fast");
    expect(pro.reason).toBe("TARGETING_MATCH");
    expect(f.evaluate("checkout", { attributes: { plan: "free" } }).value).toBe("control");
  }

  @Test.it("array attribute constraint matches by includes") arrayAttr() {
    const f = createFlags([{ key: "geo", defaultValue: false, rules: [{ attributes: { country: ["US", "CA"] }, value: true }] }]);
    expect(f.evaluate("geo", { attributes: { country: "CA" } }).value).toBe(true);
    expect(f.evaluate("geo", { attributes: { country: "DE" } }).value).toBe(false);
  }

  @Test.it("percentage rollout is deterministic + stable per targetingKey") rollout() {
    const f = createFlags([{ key: "r", defaultValue: false, rollout: 50 }]);
    const a = f.isEnabled("r", { targetingKey: "user-a" });
    // stable: same key → same result
    expect(f.isEnabled("r", { targetingKey: "user-a" })).toBe(a);
    // 0% → nobody, 100% → everybody
    const none = createFlags([{ key: "r", defaultValue: false, rollout: 0 }]);
    const all = createFlags([{ key: "r", defaultValue: false, rollout: 100 }]);
    expect(none.isEnabled("r", { targetingKey: "x" })).toBe(false);
    expect(all.isEnabled("r", { targetingKey: "x" })).toBe(true);
  }

  @Test.it("rollout distributes roughly to the target percentage") distribution() {
    const f = createFlags([{ key: "r", defaultValue: false, rollout: 30 }]);
    let on = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (f.isEnabled("r", { targetingKey: "user-" + i })) on++;
    const pct = (on / N) * 100;
    expect(pct > 22 && pct < 38).toBe(true); // ~30% ± tolerance
  }

  @Test.it("bucket() is stable and within 0..99") bucketing() {
    expect(bucket("a") === bucket("a")).toBe(true);
    expect(bucket("a") >= 0 && bucket("a") < 100).toBe(true);
  }

  @Test.it("override() forces a value (STATIC) and clears") override() {
    const f = createFlags([{ key: "x", defaultValue: false }]);
    f.override("x", true);
    const ev = f.evaluate("x");
    expect(ev.value).toBe(true);
    expect(ev.reason).toBe("STATIC");
    f.override("x", undefined);
    expect(f.isEnabled("x")).toBe(false);
  }

  @Test.it("all() snapshots every flag for a context") snapshotAll() {
    const f = createFlags([
      { key: "a", defaultValue: true },
      { key: "b", defaultValue: "v", defaultVariant: undefined },
    ]);
    const snap = f.all();
    expect(Object.keys(snap).sort()).toEqual(["a", "b"]);
    expect(snap.a?.value).toBe(true);
  }

  @Test.it("fromSnapshot rehydrates value + variant (SSR → client)") hydrate() {
    const server = createFlags([
      { key: "checkout", defaultValue: "control", variants: { control: "control", fast: "fast" }, rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },
    ]);
    const snap = server.all({ attributes: { plan: "pro" } });
    const client = fromSnapshot(snap);
    const ev = client.evaluate("checkout");
    expect(ev.value).toBe("fast");
    expect(ev.variant).toBe("fast");
  }

  @Test.it("delegates to a FlagProvider: async authoritative, sync warms cache") async provider() {
    const provider: FlagProvider = {
      name: "fake",
      async resolve(key, _ctx, fallback): Promise<Evaluation> {
        return { key, value: key === "remote" ? "on" : (fallback ?? false), reason: "TARGETING_MATCH" };
      },
    };
    const f = new FeatureFlags([{ key: "remote", defaultValue: "off" }], { provider });
    // async path → authoritative provider value
    const ev = await f.evaluateAsync("remote");
    expect(ev.value).toBe("on");
    // sync path now hits the warmed cache
    expect(f.evaluate("remote").value).toBe("on");
  }

  @Test.it("sync evaluate returns local best-effort before the provider answers") providerCold() {
    const provider: FlagProvider = { name: "slow", resolve: () => new Promise(() => {}) as any }; // never resolves
    const f = new FeatureFlags([{ key: "x", defaultValue: "local" }], { provider });
    expect(f.evaluate("x").value).toBe("local"); // cold cache → local fallback, no throw
  }

  @Test.it("onEvaluation fires for every evaluation (exposure logging)") exposures() {
    const seen: Array<{ key: string; value: unknown }> = [];
    const f = createFlags([{ key: "a", defaultValue: true }]);
    const off = f.onEvaluation((ev) => seen.push({ key: ev.key, value: ev.value }));
    f.isEnabled("a");
    f.evaluate("a");
    expect(seen.length).toBe(2);
    expect(seen[0]).toEqual({ key: "a", value: true });
    off();
    f.evaluate("a");
    expect(seen.length).toBe(2); // unsubscribed
  }

  @Test.it("MemorySource.set/remove notify subscribers → engine reloads") liveSource() {
    const src = new MemorySource([{ key: "a", defaultValue: false }]);
    const f = new FeatureFlags(src);
    let changes = 0;
    f.onChange(() => changes++);
    src.set({ key: "a", defaultValue: true });
    // onChange triggers an async load(); flush microtasks then assert
    return Promise.resolve().then(() => {
      expect(changes >= 1).toBe(true);
      expect(f.isEnabled("a")).toBe(true);
    });
  }
}

await TestApplication().addTests(FlagsSuite).reporter(new ConsoleReporter()).run();
