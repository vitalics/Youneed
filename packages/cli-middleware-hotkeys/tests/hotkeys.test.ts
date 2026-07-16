import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, scriptedTerminal, type Key } from "@youneed/cli";
import { hotkeys, type Hotkeys } from "../src/index.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

class HotkeysSuite extends Test({ name: "cli-middleware-hotkeys" }) {
  @Test.it("dispatches by key name and by ctrl-<name>")
  async dispatch() {
    const { terminal, press } = scriptedTerminal();
    const seen: string[] = [];
    class Watch extends Command("watch", { middleware: [hotkeys({ terminal })] }) {
      override async execute() {
        const keys = (this as unknown as { keys: Hotkeys }).keys;
        await new Promise<void>((done) => {
          keys.on("up", () => seen.push("up"));
          keys.on("r", (k: Key) => seen.push(`r:${k.sequence}`));
          keys.on("ctrl-c", () => done());
        });
      }
    }
    const app = Application({ name: "t", commands: [Watch], autoRun: false, stdout() {}, stderr() {} });
    const run = app.run(["watch"]);
    await flush();
    press("up", "r", "ctrl-c");
    await run;
    expect(seen).toEqual(["up", "r:r"]);
  }

  @Test.it("unsubscribe stops a handler")
  async unsubscribe() {
    const { terminal, press } = scriptedTerminal();
    let count = 0;
    class Watch extends Command("watch", { middleware: [hotkeys({ terminal })] }) {
      override async execute() {
        const keys = (this as unknown as { keys: Hotkeys }).keys;
        await new Promise<void>((done) => {
          const off = keys.on("x", () => count++);
          off();
          keys.on("q", () => done());
        });
      }
    }
    const app = Application({ name: "t", commands: [Watch], autoRun: false, stdout() {}, stderr() {} });
    const run = app.run(["watch"]);
    await flush();
    press("x", "q");
    await run;
    expect(count).toBe(0);
  }
}

await TestApplication().addTests(HotkeysSuite).reporter(new ConsoleReporter()).run();
