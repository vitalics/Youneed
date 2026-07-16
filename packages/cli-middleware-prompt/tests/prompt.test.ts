import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { alert, ask, box, choice, confirm, list, prompts, scriptedTerminal, spinner } from "../src/index.ts";

class AskSuite extends Test({ name: "prompt: ask" }) {
  @Test.it("collects typed characters and resolves on Enter")
  async types() {
    const { terminal, press } = scriptedTerminal();
    const p = ask("Name?", { terminal });
    press("h", "i", " ", "y", "o", "u", "return");
    expect(await p).toBe("hi you");
  }

  @Test.it("draws the initial frame immediately, before any key is pressed")
  async drawsBeforeInput() {
    const { terminal, press, output } = scriptedTerminal();
    const p = ask("Project name?", { terminal });
    // No key pressed yet — the prompt must already be on screen.
    expect(output().includes("Project name?")).toBe(true);
    press("return");
    await p;
  }

  @Test.it("backspace deletes; default seeds the value")
  async backspaceDefault() {
    const { terminal, press } = scriptedTerminal();
    const p = ask("Name?", { terminal, default: "abc" });
    press("backspace", "X", "return");
    expect(await p).toBe("abX");
  }
}

class ConfirmSuite extends Test({ name: "prompt: confirm" }) {
  @Test.it("y → true, n → false, Enter → default")
  async answers() {
    const t1 = scriptedTerminal();
    const y = confirm("ok?", { terminal: t1.terminal });
    t1.press("y");
    expect(await y).toBe(true);

    const t2 = scriptedTerminal();
    const n = confirm("ok?", { terminal: t2.terminal });
    t2.press("n");
    expect(await n).toBe(false);

    const t3 = scriptedTerminal();
    const d = confirm("ok?", { terminal: t3.terminal, default: true });
    t3.press("return");
    expect(await d).toBe(true);
  }
}

class ChoiceSuite extends Test({ name: "prompt: choice" }) {
  @Test.it("arrows move the cursor; Enter selects the value")
  async selects() {
    const { terminal, press } = scriptedTerminal();
    const p = choice("Env", ["dev", "staging", "prod"], { terminal });
    press("down", "down", "return"); // dev → staging → prod
    expect(await p).toBe("prod");
  }

  @Test.it("wraps around and supports {label,value} items")
  async wrapAndObjects() {
    const { terminal, press } = scriptedTerminal();
    const p = choice("Pick", [
      { label: "One", value: 1 },
      { label: "Two", value: 2 },
    ], { terminal });
    press("up", "return"); // wrap from index 0 to last → value 2
    expect(await p).toBe(2);
  }
}

class ListSuite extends Test({ name: "prompt: list" }) {
  @Test.it("space toggles; Enter resolves the selected values in order")
  async multiSelect() {
    const { terminal, press } = scriptedTerminal();
    const p = list("Features", ["ts", "lint", "tests", "ci"], { terminal });
    // toggle ts, move to tests and toggle, then confirm
    press("space", "down", "down", "space", "return");
    expect(await p).toEqual(["ts", "tests"]);
  }
}

class AlertSuite extends Test({ name: "prompt: alert" }) {
  @Test.it("resolves on any key")
  async acknowledges() {
    const { terminal, press } = scriptedTerminal();
    const p = alert("Done!", { terminal });
    press("return");
    await p; // resolves void
    expect(true).toBe(true);
  }
}

class MiddlewareSuite extends Test({ name: "prompt: middleware in a command" }) {
  @Test.it("contributes this.prompt and runs a wizard")
  async wizard() {
    const { terminal, press } = scriptedTerminal();
    let result: { name: string; env: string } | undefined;
    class Setup extends Command("setup", { middleware: [prompts({ terminal })] }) {
      async execute() {
        const name = await this.prompt.ask("Name?", { default: "app" });
        const env = await this.prompt.choice("Env", ["dev", "prod"]);
        result = { name, env };
      }
    }
    const app = Application({ name: "tool", commands: [Setup], autoRun: false, stdout() {}, stderr() {} });
    // Each prompt registers its handler only once the previous one resolves, so
    // let the microtask queue drain between phases before pressing the next key.
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const run = app.run(["setup"]);
    await flush();
    press("return"); // accept default name "app"
    await flush();
    press("down", "return"); // env → prod
    const code = await run;
    expect(code).toBe(0);
    expect(result).toEqual({ name: "app", env: "prod" });
  }
}

class ElementsSuite extends Test({ name: "prompt: customised elements" }) {
  @Test.it("box() frames content with a title and ANSI-aware width")
  boxUtility() {
    const out = box("hello", { title: "Greeting" });
    const lines = out.split("\n");
    expect(lines[0]!.startsWith("┌─ Greeting ")).toBe(true);
    expect(lines[0]!.endsWith("┐")).toBe(true);
    expect(lines[1]!.startsWith("│ hello")).toBe(true);
    expect(lines[1]!.endsWith("│")).toBe(true);
    expect(lines[2]!.startsWith("└")).toBe(true);
    // All three rows share the same width.
    expect(lines[0]!.length).toBe(lines[1]!.length);
    expect(lines[1]!.length).toBe(lines[2]!.length);
  }

  @Test.it("ask with box renders a framed input")
  askBox() {
    const { terminal, press, output } = scriptedTerminal();
    const p = ask("Name", { terminal, box: "Enter name" });
    expect(output().includes("┌─ Enter name")).toBe(true);
    press("h", "i", "return");
    return p.then((v) => expect(v).toBe("hi"));
  }

  @Test.it("choice with a custom format renders bespoke rows")
  customList() {
    const { terminal, press, output } = scriptedTerminal();
    const p = choice("Pick", ["a", "b"], {
      terminal,
      format: (item, { active }) => `${active ? ">>" : "  "} [${item.label}]`,
    });
    expect(output().includes(">> [a]")).toBe(true);
    expect(output().includes("   [b]") || output().includes("  [b]")).toBe(true);
    press("return");
    return p.then((v) => expect(v).toBe("a"));
  }

  @Test.it("spinner resolves with the work result and marks success")
  async spinnerSuccess() {
    const { terminal, output } = scriptedTerminal();
    const result = await spinner("Saving", async () => 42, { terminal, interval: 5 });
    expect(result).toBe(42);
    expect(output().includes("Saving")).toBe(true);
    expect(output().includes("✓")).toBe(true);
  }

  @Test.it("spinner marks failure and rethrows")
  async spinnerFailure() {
    const { terminal, output } = scriptedTerminal();
    let caught: unknown;
    try {
      await spinner("Loading", async () => {
        throw new Error("boom");
      }, { terminal });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toBe("boom");
    expect(output().includes("✗")).toBe(true);
  }
}

await TestApplication()
  .addTests(AskSuite)
  .addTests(ConfirmSuite)
  .addTests(ChoiceSuite)
  .addTests(ListSuite)
  .addTests(AlertSuite)
  .addTests(ElementsSuite)
  .addTests(MiddlewareSuite)
  .reporter(new ConsoleReporter())
  .run();
