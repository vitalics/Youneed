import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, scriptedTerminal } from "@youneed/cli";
import { screen, type Screen as ScreenApi } from "../src/index.ts";

class ScreenSuite extends Test({ name: "cli-middleware-screen" }) {
  @Test.it("enters the alt screen on draw and leaves it on teardown")
  async lifecycle() {
    const { terminal, output } = scriptedTerminal(80, 24);
    class Top extends Command("top", { middleware: [screen({ terminal })] }) {
      execute() {
        const s = (this as unknown as { screen: ScreenApi }).screen;
        expect(s.columns).toBe(80);
        expect(s.rows).toBe(24);
        s.draw("DASHBOARD");
      }
    }
    const app = Application({ name: "t", commands: [Top], autoRun: false, stdout() {}, stderr() {} });
    await app.run(["top"]);
    const out = output();
    expect(out.includes("\x1b[?1049h")).toBe(true); // entered alt screen
    expect(out.includes("DASHBOARD")).toBe(true);
    expect(out.includes("\x1b[?1049l")).toBe(true); // left alt screen on teardown
    expect(out.includes("\x1b[?25h")).toBe(true); // cursor restored
  }

  @Test.it("does not touch the screen when never drawn")
  async noop() {
    const { terminal, output } = scriptedTerminal();
    class Top extends Command("top", { middleware: [screen({ terminal })] }) {
      execute() {}
    }
    const app = Application({ name: "t", commands: [Top], autoRun: false, stdout() {}, stderr() {} });
    await app.run(["top"]);
    expect(output()).toBe(""); // never entered, nothing to restore
  }
}

await TestApplication().addTests(ScreenSuite).reporter(new ConsoleReporter()).run();
