import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { Context } from "@youneed/server";
import type { SsrModuleContext } from "@youneed/server-plugin-ssr";
import { createFlags, fromSnapshot } from "@youneed/feature-flags";
import { featureFlags, flagsScript } from "../src/index.ts";

/** Capture the head provider a module registers via `ctx.head()`. */
function capture(module: ReturnType<typeof featureFlags>) {
  let provider: ((ctx: Context) => string[] | string | undefined) | undefined;
  const c: SsrModuleContext = {
    app: {} as never,
    routes: [],
    absolute: (p) => p,
    head: (p) => void (provider = p),
  };
  module.setup(c);
  return provider!;
}

/** Extract the JSON assigned in a `<script>window.NAME = {...}</script>` string. */
function parseScript(html: string): { name: string; snapshot: Record<string, unknown> } {
  const m = /<script>window\.([\w$]+) = ([\s\S]*)<\/script>/.exec(html);
  if (!m) throw new Error(`no flags script in: ${html}`);
  return { name: m[1], snapshot: JSON.parse(m[2]) };
}

class FeatureFlagsSsrSuite extends Test({ name: "ssr-plugin-feature-flags" }) {
  @Test.it("injects the evaluated snapshot into the head, including new-dashboard")
  injects() {
    const flags = createFlags([
      { key: "new-dashboard", defaultValue: false, rollout: 100 },
      { key: "checkout", defaultValue: "control", variants: { control: "control", fast: "fast" },
        rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },
    ]);
    const provider = capture(featureFlags(flags));
    const html = String(provider({} as Context));

    expect(html).toContain("<script>window.__FLAGS__ = ");
    const { name, snapshot } = parseScript(html);
    expect(name).toBe("__FLAGS__");
    // 100% rollout ⇒ new-dashboard evaluates true for everyone.
    expect(snapshot["new-dashboard"]).toEqual({ key: "new-dashboard", value: true, reason: "ROLLOUT" });
    expect((snapshot["checkout"] as { value: string }).value).toBe("control"); // anonymous ⇒ default
  }

  @Test.it("per-request context varies the evaluated values")
  perRequest() {
    const flags = createFlags([
      { key: "checkout", defaultValue: "control", variants: { control: "control", fast: "fast" },
        rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },
    ]);
    const provider = capture(
      featureFlags(flags, { context: (req: Context) => ({ attributes: { plan: (req as unknown as { plan: string }).plan } }) }),
    );

    const pro = parseScript(String(provider({ plan: "pro" } as unknown as Context))).snapshot;
    expect((pro["checkout"] as { value: string; variant?: string }).value).toBe("fast");
    expect((pro["checkout"] as { variant?: string }).variant).toBe("fast");

    const free = parseScript(String(provider({ plan: "free" } as unknown as Context))).snapshot;
    expect((free["checkout"] as { value: string }).value).toBe("control");
  }

  @Test.it("custom globalVar name")
  globalVar() {
    const flags = createFlags([{ key: "a", defaultValue: true }]);
    const provider = capture(featureFlags(flags, { globalVar: "__MY_FLAGS__" }));
    const { name } = parseScript(String(provider({} as Context)));
    expect(name).toBe("__MY_FLAGS__");
  }

  @Test.it("the injected snapshot round-trips through fromSnapshot (client hydration)")
  hydrate() {
    const flags = createFlags([{ key: "new-dashboard", defaultValue: false, rollout: 100 }]);
    const provider = capture(featureFlags(flags));
    const { snapshot } = parseScript(String(provider({} as Context)));
    // The client does exactly this: fromSnapshot(window.__FLAGS__).
    const client = fromSnapshot(snapshot as never);
    expect(client.isEnabled("new-dashboard")).toBe(true);
  }

  @Test.it("flagsScript escapes </script> and falls back on a bad globalVar")
  escaping() {
    const out = flagsScript({ x: "</script><!--pwn" }, "not a valid ident");
    expect(out).toContain("<script>window.__FLAGS__ = "); // bad ident ⇒ default
    expect(out).not.toContain("</script><!--"); // payload neutralized
  }

  @Test.it("inspect() self-describes for the devtools Infra view")
  inspect() {
    const flags = createFlags([{ key: "a", defaultValue: true }, { key: "b", defaultValue: false }]);
    const info = featureFlags(flags, { context: () => ({}) }).inspect!() as {
      kind: string; globalVar: string; perRequest: boolean; keys: string[];
    };
    expect(info.kind).toBe("feature-flags");
    expect(info.globalVar).toBe("__FLAGS__");
    expect(info.perRequest).toBe(true);
    expect(info.keys.sort()).toEqual(["a", "b"]);
  }
}

await TestApplication()
  .addTests(FeatureFlagsSsrSuite)
  .reporter(new ConsoleReporter())
  .run();
