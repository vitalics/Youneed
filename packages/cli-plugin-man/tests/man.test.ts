import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, type PluginHost } from "@youneed/cli";
import { generateMan, man } from "../src/index.ts";

class ManSuite extends Test({ name: "cli-plugin-man" }) {
  @Test.it("generateMan produces a roff page from the catalogue")
  generates() {
    let host: PluginHost | undefined;
    const capture = { name: "capture", setup: (h: never) => void (host = h) };
    class Split extends Command("split <string>", { description: "Split a string" }) {
      execute() {}
    }
    Application({
      name: "ops",
      version: "1.0.0",
      description: "string tools",
      commands: [Split],
      plugins: [capture],
      autoRun: false,
      stdout() {},
      stderr() {},
    });
    const roff = generateMan(host!);
    expect(roff.startsWith(".TH OPS 1")).toBe(true);
    expect(roff.includes(".SH NAME")).toBe(true);
    expect(roff.includes("string tools")).toBe(true);
    expect(roff.includes(".SH COMMANDS")).toBe(true);
    expect(roff.includes("split <string>")).toBe(true);
  }

  @Test.it("the man command prints the page")
  async command() {
    class Real extends Command("real") {
      execute() {}
    }
    const app = Application({ name: "ops", commands: [Real], plugins: [man()], autoRun: false, stdout() {}, stderr() {} });
    const original = console.log;
    let captured = "";
    console.log = (...a: unknown[]) => void (captured += a.join(" ") + "\n");
    try {
      await app.run(["man"]);
    } finally {
      console.log = original;
    }
    expect(captured.includes(".TH OPS 1")).toBe(true);
    expect(captured.includes("real")).toBe(true);
  }
}

await TestApplication().addTests(ManSuite).reporter(new ConsoleReporter()).run();
