// Run: pnpm --filter @youneed/feature-flags-vercel test
// Verifies the Edge Config → FlagDefinition mapping and engine wiring with a
// fake `fetch` returning a fixed /items JSON — no network, no Vercel account.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createFlags } from "@youneed/feature-flags";
import { vercelSource, type FetchLike } from "../src/index.ts";

/** A fake `fetch` that always returns `items` as a successful /items response. */
function fakeFetch(items: Record<string, unknown>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string) => {
    calls.push(input);
    return {
      ok: true,
      status: 200,
      async json() {
        return items;
      },
      async text() {
        return JSON.stringify(items);
      },
    };
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const CONN = "https://edge-config.vercel.com/ecfg_abc?token=tok_123";

class VercelSourceSuite extends Test({ name: "@youneed/feature-flags-vercel source" }) {
  @Test.it("maps simple boolean/string/number values to definitions") async simple() {
    const src = vercelSource({
      connectionString: CONN,
      fetch: fakeFetch({ beta: true, theme: "dark", limit: 42 }),
    });
    const defs = await src.all();
    src.close();

    const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
    expect(byKey["beta"]).toEqual({ key: "beta", defaultValue: true });
    expect(byKey["theme"]).toEqual({ key: "theme", defaultValue: "dark" });
    expect(byKey["limit"]).toEqual({ key: "limit", defaultValue: 42 });
  }

  @Test.it("passes through full flag-definition objects") async fullDef() {
    const src = vercelSource({
      connectionString: CONN,
      fetch: fakeFetch({
        checkout: {
          defaultValue: "control",
          variants: { control: "control", fast: "fast" },
          rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
        },
        rollout: { defaultValue: false, rollout: 100 },
      }),
    });
    const defs = await src.all();
    src.close();

    const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
    expect(byKey["checkout"].defaultValue).toBe("control");
    expect(byKey["checkout"].variants).toEqual({ control: "control", fast: "fast" });
    expect(byKey["checkout"].rules).toEqual([{ attributes: { plan: "pro" }, variant: "fast" }]);
    // key is injected, not clobbered by the item's own fields
    expect(byKey["checkout"].key).toBe("checkout");
    expect(byKey["rollout"].rollout).toBe(100);
  }

  @Test.it("prefix filters and strips matching keys") async prefix() {
    const src = vercelSource({
      connectionString: CONN,
      prefix: "flag:",
      fetch: fakeFetch({ "flag:beta": true, "flag:theme": "dark", "other:noise": 1 }),
    });
    const defs = await src.all();
    src.close();

    const keys = defs.map((d) => d.key).sort();
    expect(keys).toEqual(["beta", "theme"]);
  }

  @Test.it("accepts edgeConfigId + token instead of a connection string") async pair() {
    const fetch = fakeFetch({ beta: true });
    const src = vercelSource({ edgeConfigId: "ecfg_xyz", token: "tok_999", fetch });
    await src.all();
    src.close();
    // The read URL targets the given id + token.
    expect(fetch.calls[0].includes("/ecfg_xyz/items")).toBeTruthy();
    expect(fetch.calls[0].includes("token=tok_999")).toBeTruthy();
  }

  @Test.it("throws on a malformed connection string / missing credentials") missing() {
    expect(() => vercelSource({ fetch: fakeFetch({}) })).toThrow();
    expect(() => vercelSource({ connectionString: "not a url", fetch: fakeFetch({}) })).toThrow();
  }

  @Test.it("drives a createFlags engine — a pulled flag evaluates locally") async engine() {
    const src = vercelSource({
      connectionString: CONN,
      fetch: fakeFetch({
        "new-dashboard": true,
        checkout: {
          defaultValue: "control",
          variants: { control: "control", fast: "fast" },
          rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
        },
      }),
    });
    const flags = createFlags(src);
    await flags.load(); // async source → fill the snapshot from Edge Config

    expect(flags.isEnabled("new-dashboard")).toBe(true);
    // targeting rule from a pulled full-def flag
    expect(flags.value("checkout", { attributes: { plan: "pro" } })).toBe("fast");
    expect(flags.value("checkout", { attributes: { plan: "free" } })).toBe("control");

    flags.dispose();
    src.close();
  }
}

await TestApplication().addTests(VercelSourceSuite).reporter(new ConsoleReporter()).run();
