// Run: pnpm --filter @youneed/feature-flags-posthog test
// Verifies the PostHog provider against a canned /decide response — no network.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { FeatureFlags } from "@youneed/feature-flags";
import { posthogProvider, type FetchLike } from "../src/index.ts";

/** A fake `fetch` returning a canned /decide body, recording the request it saw. */
function fakeFetch(body: unknown): { fetch: FetchLike; calls: Array<{ url: string; payload: any }> } {
  const calls: Array<{ url: string; payload: any }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, payload: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

// A canned /decide response: a boolean flag + a multivariate (string) flag.
const DECIDE = {
  featureFlags: { "new-dashboard": true, "kill-switch": false, checkout: "fast" },
  featureFlagPayloads: { checkout: { color: "green" } },
};

class PosthogProviderSuite extends Test({ name: "@youneed/feature-flags-posthog" }) {
  @Test.it("maps a boolean-true flag → value + TARGETING_MATCH") async boolTrue() {
    const { fetch } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", fetch });
    const ev = await p.resolve("new-dashboard", { targetingKey: "u1" });
    expect(ev.value).toBe(true);
    expect(ev.reason).toBe("TARGETING_MATCH");
    expect(ev.variant).toBeUndefined();
  }

  @Test.it("maps a boolean-false flag → value + DEFAULT") async boolFalse() {
    const { fetch } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", fetch });
    const ev = await p.resolve("kill-switch", { targetingKey: "u1" });
    expect(ev.value).toBe(false);
    expect(ev.reason).toBe("DEFAULT");
  }

  @Test.it("maps a string flag → value + variant + TARGETING_MATCH") async variant() {
    const { fetch } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", fetch });
    const ev = await p.resolve("checkout", { targetingKey: "u1" });
    expect(ev.value).toBe("fast");
    expect(ev.variant).toBe("fast");
    expect(ev.reason).toBe("TARGETING_MATCH");
  }

  @Test.it("missing flag → uses the caller fallback") async fallback() {
    const { fetch } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", fetch, cacheTtlMs: 0 });
    const ev = await p.resolve("unknown", { targetingKey: "u1" }, "fb");
    expect(ev.value).toBe("fb");
    const noFb = await p.resolve("unknown", { targetingKey: "u1" });
    expect(noFb.value).toBe(false);
    expect(noFb.reason).toBe("DEFAULT");
  }

  @Test.it("sends distinct_id from targetingKey (anonymous otherwise) + api_key + properties") async request() {
    const { fetch, calls } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", fetch, cacheTtlMs: 0 });
    await p.resolve("new-dashboard", { targetingKey: "user-42", attributes: { plan: "pro" } });
    await p.resolve("new-dashboard", {});
    expect(calls[0].url).toContain("/decide?v=3");
    expect(calls[0].payload.api_key).toBe("phc_test");
    expect(calls[0].payload.distinct_id).toBe("user-42");
    expect(calls[0].payload.person_properties).toEqual({ plan: "pro" });
    expect(calls[1].payload.distinct_id).toBe("anonymous");
  }

  @Test.it("memoises one /decide per context — many keys, one HTTP call") async memo() {
    const { fetch, calls } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", fetch });
    const ctx = { targetingKey: "u1" };
    await Promise.all([p.resolve("new-dashboard", ctx), p.resolve("checkout", ctx), p.resolve("kill-switch", ctx)]);
    expect(calls.length).toBe(1);
    expect(p.keys!()).toEqual(["new-dashboard", "kill-switch", "checkout"]);
  }

  @Test.it("respects a custom host") async host() {
    const { fetch, calls } = fakeFetch(DECIDE);
    const p = posthogProvider({ apiKey: "phc_test", host: "https://eu.posthog.com/", fetch });
    await p.resolve("new-dashboard", { targetingKey: "u1" });
    expect(calls[0].url).toBe("https://eu.posthog.com/decide?v=3");
  }

  @Test.it("plugs into FeatureFlags — evaluateAsync returns the PostHog value") async engine() {
    const { fetch } = fakeFetch(DECIDE);
    const flags = new FeatureFlags([], { provider: posthogProvider({ apiKey: "phc_test", fetch }) });
    const dash = await flags.evaluateAsync("new-dashboard", { targetingKey: "u1" });
    expect(dash.value).toBe(true);
    const co = await flags.evaluateAsync<string>("checkout", { targetingKey: "u1" });
    expect(co.value).toBe("fast");
    expect(co.variant).toBe("fast");
    flags.dispose();
  }
}

await TestApplication().addTests(PosthogProviderSuite).reporter(new ConsoleReporter()).run();
