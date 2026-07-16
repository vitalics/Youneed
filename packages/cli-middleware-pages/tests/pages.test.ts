import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, scriptedTerminal } from "@youneed/cli";
import { pages, type Pager } from "../src/index.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

class PagesSuite extends Test({ name: "cli-middleware-pages" }) {
  @Test.it("pages content and resolves when the user quits")
  async show() {
    const { terminal, press, output } = scriptedTerminal(80, 5);
    const text = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
    let finished = false;
    class Log extends Command("log", { middleware: [pages({ terminal })] }) {
      override async execute() {
        await (this as unknown as { pages: Pager }).pages.show(text);
        finished = true;
      }
    }
    const app = Application({ name: "t", commands: [Log], autoRun: false, stdout() {}, stderr() {} });
    const run = app.run(["log"]);
    await flush();
    press("down", "space", "q");
    await run;
    expect(finished).toBe(true);
    const out = output();
    expect(out.includes("line 1")).toBe(true); // first page
    expect(out.includes("\x1b[?1049h")).toBe(true); // entered alt screen
    expect(out.includes("\x1b[?1049l")).toBe(true); // left on quit
    expect(out.includes("/12")).toBe(true); // footer position
  }
}

await TestApplication().addTests(PagesSuite).reporter(new ConsoleReporter()).run();
