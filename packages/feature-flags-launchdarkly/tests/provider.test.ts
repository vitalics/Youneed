// Run: pnpm --filter @youneed/feature-flags-launchdarkly test
// Verifies the LaunchDarkly provider adapter against an INJECTED fake LD client —
// no real @launchdarkly/node-server-sdk and no network required.
import { FeatureFlags } from "@youneed/feature-flags";
import type { Evaluation } from "@youneed/feature-flags";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { launchDarklyProvider, toLDContext } from "../src/index.ts";
import type { LDClient, LDContext, LDEvaluationDetail } from "../src/index.ts";

/** A configurable fake LaunchDarkly server client. */
function fakeClient(detail: LDEvaluationDetail, flagKeys: string[] = []): LDClient & {
  calls: { key: string; context: LDContext; fallback: unknown }[];
  updates: (() => void)[];
  closed: boolean;
} {
  const calls: { key: string; context: LDContext; fallback: unknown }[] = [];
  const updates: (() => void)[] = [];
  let closed = false;
  const listeners = new Map<string, ((...a: unknown[]) => void)[]>();
  return {
    calls,
    updates,
    get closed() {
      return closed;
    },
    async waitForInitialization() {
      return undefined;
    },
    async variationDetail(key, context, fallback) {
      calls.push({ key, context, fallback });
      return detail;
    },
    async allFlagsState() {
      return { allValues: () => Object.fromEntries(flagKeys.map((k) => [k, true])) };
    },
    on(event, cb) {
      (listeners.get(event) ?? listeners.set(event, []).get(event)!).push(cb);
      if (event === "update") updates.push(() => cb());
    },
    off(event, cb) {
      const arr = listeners.get(event);
      if (arr) arr.splice(arr.indexOf(cb), 1);
    },
    async close() {
      closed = true;
    },
  };
}

class LaunchDarklyProviderSuite extends Test({ name: "@youneed/feature-flags-launchdarkly provider" }) {
  @Test.it("context mapping: targetingKey → key, attributes spread, kind=user") contextMap() {
    const ctx = toLDContext({ targetingKey: "u1", attributes: { plan: "pro", country: "DE" } });
    expect(ctx.kind).toBe("user");
    expect(ctx.key).toBe("u1");
    expect(ctx.plan).toBe("pro");
    expect(ctx.country).toBe("DE");
    expect(toLDContext({}).key).toBe("anonymous");
  }

  @Test.it("maps RULE_MATCH → TARGETING_MATCH with value + variant index") async ruleMatch() {
    const client = fakeClient({ value: "fast", variationIndex: 2, reason: { kind: "RULE_MATCH" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    await provider.init!();
    const ev = await provider.resolve("checkout", { targetingKey: "u1" });
    expect(ev).toEqual({ key: "checkout", value: "fast", variant: "2", reason: "TARGETING_MATCH" } as Evaluation);
    expect(client.calls[0]!.context.key).toBe("u1");
    expect(client.calls[0]!.fallback).toBe(false); // default fallback
  }

  @Test.it("maps FALLTHROUGH → TARGETING_MATCH") async fallthrough() {
    const client = fakeClient({ value: true, variationIndex: 0, reason: { kind: "FALLTHROUGH" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    const ev = await provider.resolve("f", {});
    expect(ev.reason).toBe("TARGETING_MATCH");
    expect(ev.value).toBe(true);
    expect(ev.variant).toBe("0");
  }

  @Test.it("maps OFF → DEFAULT, passes fallback through") async offReason() {
    const client = fakeClient({ value: "control", variationIndex: 1, reason: { kind: "OFF" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    const ev = await provider.resolve("checkout", { targetingKey: "u2" }, "control");
    expect(ev.reason).toBe("DEFAULT");
    expect(client.calls[0]!.fallback).toBe("control");
  }

  @Test.it("maps ERROR reason → ERROR") async errorReason() {
    const client = fakeClient({ value: false, variationIndex: null, reason: { kind: "ERROR", errorKind: "FLAG_NOT_FOUND" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    const ev = await provider.resolve("missing", {}, false);
    expect(ev.reason).toBe("ERROR");
    expect(ev.variant).toBe(undefined); // null variationIndex → no variant
  }

  @Test.it("no client (SDK not initialized) → fallback + reason ERROR") async notInitialized() {
    const provider = launchDarklyProvider({ sdkKey: "sdk-test" }); // no client, no init() call
    const ev = await provider.resolve("x", {}, "fb");
    expect(ev).toEqual({ key: "x", value: "fb", reason: "ERROR" } as Evaluation);
  }

  @Test.it("keys() reads allFlagsState().allValues()") async keys() {
    const client = fakeClient({ value: true, variationIndex: 0, reason: { kind: "FALLTHROUGH" } }, ["a", "b", "c"]);
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    expect(await provider.keys!()).toEqual(["a", "b", "c"]);
  }

  @Test.it("onChange subscribes to 'update' and returns an unsubscribe") async onChange() {
    const client = fakeClient({ value: true, variationIndex: 0, reason: { kind: "FALLTHROUGH" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    let fired = 0;
    const off = provider.onChange!(() => void fired++);
    client.updates.forEach((u) => u()); // simulate LD pushing an update
    expect(fired).toBe(1);
    off();
  }

  @Test.it("close() closes the client") async close() {
    const client = fakeClient({ value: true, variationIndex: 0, reason: { kind: "FALLTHROUGH" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    await provider.close!();
    expect(client.closed).toBe(true);
  }

  @Test.it("engine integration: FeatureFlags + evaluateAsync returns the LD value") async engine() {
    const client = fakeClient({ value: "fast", variationIndex: 2, reason: { kind: "RULE_MATCH" } });
    const provider = launchDarklyProvider({ sdkKey: "sdk-test", client });
    const flags = new FeatureFlags([], { provider });
    const ev = await flags.evaluateAsync("checkout", { targetingKey: "u1", attributes: { plan: "pro" } });
    expect(ev.value).toBe("fast");
    expect(ev.reason).toBe("TARGETING_MATCH");
    expect(client.calls.at(-1)!.context.plan).toBe("pro");
    flags.dispose();
  }
}

await TestApplication().addTests(LaunchDarklyProviderSuite).reporter(new ConsoleReporter()).run();
