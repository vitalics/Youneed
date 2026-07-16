import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, type PluginHost } from "@youneed/cli";
import { help, renderHelp } from "../src/index.ts";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

class HelpSuite extends Test({ name: "cli-plugin-help" }) {
  @Test.it("renderHelp lists commands and global + per-command examples")
  renders() {
    let host: PluginHost | undefined;
    const capture = { name: "capture", setup: (h: never) => void (host = h) };
    class Split extends Command("split <string>", { description: "Split a string" }) {
      execute() {}
    }
    Application({ name: "ops", version: "1.0.0", commands: [Split], plugins: [capture], autoRun: false, stdout() {}, stderr() {} });

    const all = plain(renderHelp(host!, { split: ["ops split a,b,c"] }));
    expect(all.includes("Commands:")).toBe(true);
    expect(all.includes("split <string>")).toBe(true);
    expect(all.includes("Examples:")).toBe(true);
    expect(all.includes("ops split a,b,c")).toBe(true);

    const one = plain(renderHelp(host!, { split: ["ops split a,b,c"] }, "split"));
    expect(one.includes("Usage: ops split <string>")).toBe(true);
    expect(one.includes("ops split a,b,c")).toBe(true);
  }

  @Test.it("registered help command replaces the built-in help")
  async replacesBuiltin() {
    class Split extends Command("split <string>", { description: "Split a string" }) {
      execute() {}
    }
    const app = Application({
      name: "ops",
      commands: [Split],
      plugins: [help({ examples: { split: ["ops split a,b"] } })],
      autoRun: false,
      stdout() {},
      stderr() {},
    });
    const original = console.log;
    let captured = "";
    console.log = (...a: unknown[]) => void (captured += a.join(" ") + "\n");
    try {
      await app.run(["help"]);
    } finally {
      console.log = original;
    }
    // The plugin's richer help ran (built-in has no "Examples:" section).
    expect(plain(captured).includes("Examples:")).toBe(true);
    expect(plain(captured).includes("ops split a,b")).toBe(true);
  }
}

await TestApplication().addTests(HelpSuite).reporter(new ConsoleReporter()).run();
