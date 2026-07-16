import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { createFlags, type FeatureFlags } from "@youneed/feature-flags";
import { featureFlags, flagsMiddleware } from "../src/index.ts";

/** Strip ANSI codes so assertions match on visible text. */
const clean = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

function harness(flags: FeatureFlags, commands: Parameters<typeof Application>[0]["commands"] = []) {
  let out = "";
  let code = 0;
  const write = (chunk: string): void => void (out += chunk);
  const app = Application({
    name: "ops",
    commands,
    plugins: [featureFlags(flags)],
    autoRun: false,
    stdout: write,
    stderr: write,
    exit: (c) => (code = c),
  });
  return {
    get output() {
      return clean(out);
    },
    get code() {
      return code;
    },
    async run(argv: string[]) {
      out = "";
      // The `flags` command prints via console.log (like cli-plugin-help); capture it.
      const original = console.log;
      console.log = (...parts: unknown[]) => void (out += parts.join(" ") + "\n");
      try {
        code = await app.run(argv);
      } finally {
        console.log = original;
      }
      return code;
    },
  };
}

class FeatureFlagsCliSuite extends Test({ name: "cli-plugin-feature-flags" }) {
  @Test.it("the `flags` command lists every flag with its value and reason")
  async lists() {
    const flags = createFlags([
      { key: "beta", defaultValue: false },
      { key: "theme", defaultValue: "light", variants: { light: "light", dark: "dark" }, defaultVariant: "dark" },
    ]);
    const h = harness(flags);
    await h.run(["flags"]);
    expect(h.code).toBe(0);
    expect(h.output).toContain("beta");
    expect(h.output).toContain("theme");
    // theme resolves to its defaultVariant "dark"
    expect(h.output).toContain("dark");
    expect(h.output).toContain("DEFAULT");
  }

  @Test.it("`flags <key>` shows detail for one flag")
  async detail() {
    const flags = createFlags([{ key: "beta", description: "the beta path", defaultValue: false }]);
    const h = harness(flags);
    await h.run(["flags", "beta"]);
    expect(h.output).toContain("beta");
    expect(h.output).toContain("the beta path");
    expect(h.output).toContain("reason");
  }

  @Test.it("--on overrides a flag to true (persisted in-process on the engine)")
  async on() {
    const flags = createFlags([{ key: "beta", defaultValue: false }]);
    expect(flags.isEnabled("beta")).toBe(false);
    const h = harness(flags);
    await h.run(["flags", "--on", "beta"]);
    expect(h.code).toBe(0);
    expect(flags.isEnabled("beta")).toBe(true);
    expect(flags.overrides().beta).toBe(true);
  }

  @Test.it("--off overrides a flag to false")
  async off() {
    const flags = createFlags([{ key: "beta", defaultValue: true }]);
    expect(flags.isEnabled("beta")).toBe(true);
    const h = harness(flags);
    await h.run(["flags", "--off", "beta"]);
    expect(flags.isEnabled("beta")).toBe(false);
    expect(flags.overrides().beta).toBe(false);
  }

  @Test.it("--set parses the value (JSON) and --clear removes the override")
  async setAndClear() {
    const flags = createFlags([{ key: "limit", defaultValue: 10 }]);
    const h = harness(flags);
    await h.run(["flags", "--set", "limit=42"]);
    expect(flags.value("limit")).toBe(42);
    await h.run(["flags", "--clear", "limit"]);
    expect(flags.value("limit")).toBe(10);
    expect(Object.prototype.hasOwnProperty.call(flags.overrides(), "limit")).toBe(false);
  }

  @Test.it("the middleware contributes this.flags so a command can gate on a flag")
  async middleware() {
    let enabled: boolean | undefined;
    let variant: string | undefined;
    const flags = createFlags([
      { key: "beta", defaultValue: false },
      { key: "theme", defaultValue: "light", variants: { light: "light", dark: "dark" }, defaultVariant: "dark" },
    ]);
    flags.override("beta", true);

    class Deploy extends Command({ name: "deploy", middleware: [flagsMiddleware(flags)] }) {
      execute() {
        enabled = this.flags.isEnabled("beta");
        variant = this.flags.variant("theme");
      }
    }

    const h = harness(flags, [Deploy]);
    await h.run(["deploy"]);
    expect(h.code).toBe(0);
    expect(enabled).toBe(true);
    expect(variant).toBe("dark");
  }

  @Test.it("the middleware binds the default context from opts.context")
  async context() {
    let onValue: string | undefined;
    let offValue: string | undefined;
    const flags = createFlags([
      {
        key: "checkout",
        defaultValue: "control",
        variants: { control: "control", fast: "fast" },
        rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
      },
    ]);

    class Buy extends Command({
      name: "buy",
      middleware: [flagsMiddleware(flags, { context: { attributes: { plan: "pro" } } })],
    }) {
      execute() {
        onValue = this.flags.value<string>("checkout"); // uses bound pro context → "fast"
        offValue = this.flags.value<string>("checkout", { attributes: { plan: "free" } }); // explicit override
      }
    }

    const h = harness(flags, [Buy]);
    await h.run(["buy"]);
    expect(onValue).toBe("fast");
    expect(offValue).toBe("control");
  }
}

await TestApplication().addTests(FeatureFlagsCliSuite).reporter(new ConsoleReporter()).run();
