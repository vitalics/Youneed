import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, defaultOptions, option } from "@youneed/cli";
import { applyConfig, config, loadConfigFile } from "../src/index.ts";

function captureOption(
  plugins: Parameters<typeof Application>[0]["plugins"],
  argv: string[],
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  const sep = option("-s, --separator <char>", { default: "," });
  const verbose = option("-v, --verbose");
  class Split extends Command("split <string>", { options: [sep, verbose, ...defaultOptions()] }) {
    execute() {
      captured = { ...this.options };
    }
  }
  const app = Application({ name: "ops", commands: [Split], plugins, autoRun: false, stdout() {}, stderr() {} });
  return app.run(argv).then(() => captured);
}

class ConfigSuite extends Test({ name: "cli-plugin-config" }) {
  @Test.it("config data seeds option defaults")
  async seedsDefaults() {
    const opts = await captureOption([config({ data: { separator: ";" } })], ["split", "x"]);
    expect(opts.separator).toBe(";");
  }

  @Test.it("a CLI flag still overrides the config default")
  async cliWins() {
    const opts = await captureOption([config({ data: { separator: ";" } })], ["split", "x", "-s", "|"]);
    expect(opts.separator).toBe("|");
  }

  @Test.it("a commands.<name> section applies only to that command")
  async perCommand() {
    const opts = await captureOption(
      [config({ data: { commands: { split: { verbose: true } } } })],
      ["split", "x"],
    );
    expect(opts.verbose).toBe(true);
  }

  @Test.it("applyConfig mutates the resolved option defaults directly")
  applyDirect() {
    let host: Parameters<typeof applyConfig>[0] | undefined;
    const capture = { name: "capture", setup: (h: never) => void (host = h) };
    const sep = option("-s, --separator <char>", { default: "," });
    class Split extends Command("split <s>", { options: [sep] }) {
      execute() {}
    }
    Application({ name: "ops", commands: [Split], plugins: [capture], autoRun: false, stdout() {}, stderr() {} });
    const before = host!.commands[0]!.options.find((o) => o.key === "separator")!.default;
    applyConfig(host!, { separator: ";" });
    const after = host!.commands[0]!.options.find((o) => o.key === "separator")!.default;
    expect(before).toBe(",");
    expect(after).toBe(";");
  }

  @Test.it("loadConfigFile reads a JSON file from the cwd")
  loadsFile() {
    const dir = mkdtempSync(join(tmpdir(), "cfg-"));
    writeFileSync(join(dir, "ops.config.json"), JSON.stringify({ separator: "::" }));
    const data = loadConfigFile("ops", { cwd: dir });
    expect(data?.separator).toBe("::");
    rmSync(dir, { recursive: true, force: true });
  }
}

await TestApplication().addTests(ConfigSuite).reporter(new ConsoleReporter()).run();
