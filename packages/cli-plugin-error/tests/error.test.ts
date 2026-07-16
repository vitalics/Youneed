import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { CliError, errorReporter } from "../src/index.ts";

function harness(plugins: Parameters<typeof Application>[0]["plugins"], makeCmd: () => Parameters<typeof Application>[0]["commands"]) {
  const err: string[] = [];
  let code = 0;
  const app = Application({
    name: "tool",
    commands: makeCmd(),
    plugins,
    autoRun: false,
    stdout() {},
    stderr: (l) => err.push(l),
    exit: (c) => (code = c),
  });
  return { err, run: (argv: string[]) => app.run(argv).then((c) => (code = c)), get code() { return code; } };
}

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

class ErrorSuite extends Test({ name: "cli-plugin-error" }) {
  @Test.it("formats a thrown error with a ✖ header and exits 1")
  async formats() {
    class Boom extends Command("boom") {
      execute() {
        throw new Error("it broke");
      }
    }
    const h = harness([errorReporter()], () => [Boom]);
    await h.run(["boom"]);
    expect(h.code).toBe(1);
    const out = plain(h.err.join("\n"));
    expect(out.includes("✖")).toBe(true);
    expect(out.includes("it broke")).toBe(true);
  }

  @Test.it("surfaces a CliError hint and code")
  async hintAndCode() {
    class Boom extends Command("boom") {
      execute(): never {
        throw new CliError("missing token", { hint: "run `tool login` first", code: "EAUTH" });
      }
    }
    const h = harness([errorReporter()], () => [Boom]);
    await h.run(["boom"]);
    const out = plain(h.err.join("\n"));
    expect(out.includes("missing token")).toBe(true);
    expect(out.includes("[EAUTH]")).toBe(true);
    expect(out.includes("hint:")).toBe(true);
    expect(out.includes("run `tool login` first")).toBe(true);
  }

  @Test.it("shows the stack when stack: true")
  async stack() {
    class Boom extends Command("boom") {
      execute() {
        throw new Error("deep");
      }
    }
    const h = harness([errorReporter({ stack: true })], () => [Boom]);
    await h.run(["boom"]);
    expect(plain(h.err.join("\n")).includes("at ")).toBe(true); // a stack frame
  }

  @Test.it("a custom format replaces the output")
  async custom() {
    class Boom extends Command("boom") {
      execute() {
        throw new Error("x");
      }
    }
    const h = harness([errorReporter({ format: (e) => `CUSTOM: ${(e as Error).message}` })], () => [Boom]);
    await h.run(["boom"]);
    expect(h.err.join("\n")).toBe("CUSTOM: x");
  }
}

await TestApplication().addTests(ErrorSuite).reporter(new ConsoleReporter()).run();
