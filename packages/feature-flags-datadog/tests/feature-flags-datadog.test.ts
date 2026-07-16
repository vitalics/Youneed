// Run: pnpm --filter @youneed/feature-flags-datadog test
// Exposure batching to the Datadog Logs intake, with an injected fake fetch — no network.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createFlags } from "@youneed/feature-flags";
import { datadogExposures, attachDatadog } from "../src/index.ts";

/** A fetch double capturing every POST (url, headers, parsed body). */
function fakeFetch(status = 202) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const fn = (async (url: string, init: any) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body as string) });
    return { ok: status < 400, status } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

class DatadogSuite extends Test({ name: "@youneed/feature-flags-datadog" }) {
  @Test.it("ships exposure records with flag/value/reason/targetingKey to the intake") async records() {
    const { fn, calls } = fakeFetch();
    const flags = createFlags([
      { key: "new-dashboard", defaultValue: false, rollout: 100 },
      { key: "checkout", defaultValue: "control", variants: { control: "control", fast: "fast" }, rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },
    ]);
    const exp = attachDatadog(flags, { apiKey: "dd-secret", service: "web", env: "prod", flushMs: 0, fetch: fn });

    flags.isEnabled("new-dashboard", { targetingKey: "user-1" });
    flags.variant("checkout", { targetingKey: "user-2", attributes: { plan: "pro" } });
    await exp.flush();

    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://http-intake.logs.datadoghq.com/api/v2/logs");
    expect(calls[0]!.headers["DD-API-KEY"]).toBe("dd-secret");
    expect(calls[0]!.headers["content-type"]).toBe("application/json");

    const recs = calls[0]!.body as any[];
    const dash = recs.find((r) => r.flag === "new-dashboard");
    expect(dash.value).toBe(true);
    expect(dash.reason).toBe("ROLLOUT");
    expect(dash.targetingKey).toBe("user-1");
    expect(dash.ddsource).toBe("feature-flags");
    expect(dash.ddtags).toBe("env:prod,service:web");

    const checkout = recs.find((r) => r.flag === "checkout");
    expect(checkout.value).toBe("fast");
    expect(checkout.variant).toBe("fast");
    expect(checkout.reason).toBe("TARGETING_MATCH");
    expect(checkout.targetingKey).toBe("user-2");

    const stats = exp.stats();
    expect(stats.sent).toBe(2);
    expect(stats.queued).toBe(0);
  }

  @Test.it("auto-flushes when the batch size is reached") async autoFlush() {
    const { fn, calls } = fakeFetch();
    const flags = createFlags([{ key: "f", defaultValue: true }]);
    const exp = attachDatadog(flags, { apiKey: "k", batchSize: 2, flushMs: 0, fetch: fn, dedup: false });

    flags.isEnabled("f", { targetingKey: "a" });
    expect(calls.length).toBe(0); // 1 < batchSize
    flags.isEnabled("f", { targetingKey: "b" });
    await new Promise((r) => setTimeout(r, 5)); // let the fire-and-forget flush settle
    expect(calls.length).toBe(1);
    expect(calls[0]!.body.length).toBe(2);
    expect(exp.stats().sent).toBe(2);
    expect(exp.stats().queued).toBe(0);
  }

  @Test.it("counts failures on a non-2xx response") async failure() {
    const { fn } = fakeFetch(500);
    const flags = createFlags([{ key: "f", defaultValue: true }]);
    const exp = attachDatadog(flags, { apiKey: "k", flushMs: 0, fetch: fn });
    flags.isEnabled("f");
    await exp.flush();
    const stats = exp.stats();
    expect(stats.failed).toBe(1);
    expect(stats.sent).toBe(0);
    expect(stats.lastError).toBe("HTTP 500");
  }

  @Test.it("respects a custom site and source, and empty flush is a no-op") async siteAndNoop() {
    const { fn, calls } = fakeFetch();
    const exp = datadogExposures({ apiKey: "k", site: "datadoghq.eu", source: "ff", flushMs: 0, fetch: fn });
    expect(exp.stats().url).toBe("https://http-intake.logs.datadoghq.eu/api/v2/logs");
    await exp.flush(); // nothing buffered
    expect(calls.length).toBe(0);
    exp.listener({ key: "x", value: 1, reason: "DEFAULT" }, { targetingKey: "t" });
    await exp.flush();
    expect(calls.length).toBe(1);
    expect(calls[0]!.body[0].ddsource).toBe("ff");
  }

  @Test.it("dedups identical exposures within a batch window (count) but counts all sent") async dedup() {
    const { fn, calls } = fakeFetch();
    const flags = createFlags([{ key: "f", defaultValue: true }]);
    const exp = attachDatadog(flags, { apiKey: "k", flushMs: 0, fetch: fn }); // dedup default true
    flags.isEnabled("f", { targetingKey: "same" });
    flags.isEnabled("f", { targetingKey: "same" });
    flags.isEnabled("f", { targetingKey: "same" });
    await exp.flush();
    expect(calls.length).toBe(1);
    expect(calls[0]!.body.length).toBe(1); // collapsed
    expect(calls[0]!.body[0].count).toBe(3);
    expect(exp.stats().sent).toBe(3); // but all 3 exposures counted
  }
}

await TestApplication().addTests(DatadogSuite).reporter(new ConsoleReporter()).run();
