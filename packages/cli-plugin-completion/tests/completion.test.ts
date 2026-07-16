import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, defaultOptions, option } from "@youneed/cli";
import { buildSpec, completion, generateCompletion, type CompletionSpec } from "../src/index.ts";

const SPEC: CompletionSpec = {
  name: "ops",
  options: ["--help", "--version"],
  commands: [
    { name: "split", description: "split a string", options: ["--first", "-f", "--separator", "-s"] },
    { name: "status", description: "show status", options: [] },
  ],
};

class GenerateSuite extends Test({ name: "completion: generators" }) {
  @Test.it("bash script registers a completion function with the commands")
  bash() {
    const out = generateCompletion(SPEC, "bash");
    expect(out.includes("complete -F _ops_complete ops")).toBe(true);
    expect(out.includes("split status")).toBe(true);
    expect(out.includes("split) opts=")).toBe(true);
    expect(out.includes("--first")).toBe(true);
  }

  @Test.it("zsh script is a #compdef with described commands")
  zsh() {
    const out = generateCompletion(SPEC, "zsh");
    expect(out.startsWith("#compdef ops")).toBe(true);
    expect(out.includes("'split:split a string'")).toBe(true);
    expect(out.includes("compdef _ops ops")).toBe(true);
  }

  @Test.it("fish script emits complete -c lines and converts flags")
  fish() {
    const out = generateCompletion(SPEC, "fish");
    expect(out.includes('complete -c ops -n "__fish_use_subcommand" -a "split"')).toBe(true);
    expect(out.includes("-l first")).toBe(true); // --first → -l first
    expect(out.includes("-s f")).toBe(true); //    -f      → -s f
  }
}

class PluginSuite extends Test({ name: "completion: plugin" }) {
  @Test.it("buildSpec reads the catalogue and excludes the completion command")
  buildsFromHost() {
    let spec: CompletionSpec | undefined;
    const capture = { name: "capture", setup: (host: never) => void (spec = buildSpec(host, "completion")) };
    const sep = option("-s, --separator <char>", { default: "," });
    class Split extends Command("split <string>", { options: [sep, ...defaultOptions()] }) {
      execute() {}
    }
    Application({
      name: "ops",
      commands: [Split],
      plugins: [completion(), capture],
      autoRun: false,
      stdout() {},
      stderr() {},
    });
    const names = spec!.commands.map((c) => c.name);
    expect(names.includes("split")).toBe(true);
    expect(names.includes("completion")).toBe(false); // excluded
    const split = spec!.commands.find((c) => c.name === "split")!;
    expect(split.options.includes("--separator")).toBe(true);
    expect(split.options.includes("-s")).toBe(true);
  }

  @Test.it("the completion command prints a script")
  async printsScript() {
    class Real extends Command("real") {
      execute() {}
    }
    const app = Application({
      name: "ops",
      commands: [Real],
      plugins: [completion()],
      autoRun: false,
      stdout() {},
      stderr() {},
    });
    // The command prints via console.log — capture it.
    const original = console.log;
    let captured = "";
    console.log = (...args: unknown[]) => void (captured += args.join(" ") + "\n");
    let code = 0;
    try {
      code = await app.run(["completion", "bash"]);
    } finally {
      console.log = original;
    }
    expect(code).toBe(0);
    expect(captured.includes("complete -F _ops_complete ops")).toBe(true);
  }
}

await TestApplication().addTests(GenerateSuite).addTests(PluginSuite).reporter(new ConsoleReporter()).run();
