import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { color, createColor, type Color } from "../src/index.ts";

function harness(config: Parameters<typeof Application>[0]) {
  let code = 0;
  const app = Application({ ...config, autoRun: false, stdout() {}, stderr() {}, exit: (c) => (code = c) });
  return {
    get code() {
      return code;
    },
    async run(argv: string[]) {
      code = await app.run(argv);
      return code;
    },
  };
}

class ColorSuite extends Test({ name: "cli-middleware-color" }) {
  @Test.it("wraps text in ANSI codes when enabled")
  enabled() {
    const c = createColor(true);
    expect(c.red("x")).toBe("\x1b[31mx\x1b[39m");
    expect(c.bold("x")).toBe("\x1b[1mx\x1b[22m");
  }

  @Test.it("nests styles with distinct close codes")
  nesting() {
    const c = createColor(true);
    // bold(red("x")) keeps both: 1m … 31m x 39m … 22m
    expect(c.bold(c.red("x"))).toBe("\x1b[1m\x1b[31mx\x1b[39m\x1b[22m");
  }

  @Test.it("wraps text in background ANSI codes via this.color.background")
  background() {
    const c = createColor(true);
    expect(c.background.magenta("x")).toBe("\x1b[45mx\x1b[49m");
    // Foreground over background composes:
    expect(c.white(c.background.magenta("x"))).toBe("\x1b[37m\x1b[45mx\x1b[49m\x1b[39m");
  }

  @Test.it("is the identity function when disabled")
  disabled() {
    const c = createColor(false);
    expect(c.red("x")).toBe("x");
    expect(c.bold(c.green("y"))).toBe("y");
    expect(c.background.magenta("z")).toBe("z");
    expect(c.enabled).toBe(false);
  }

  @Test.it("contributes this.color to the command")
  contributes() {
    let captured: Color | undefined;
    class Show extends Command({ name: "show", middleware: [color({ enabled: true })] }) {
      execute() {
        captured = this.color;
      }
    }
    const h = harness({ name: "tool", commands: [Show] });
    return h.run(["show"]).then(() => {
      expect(captured?.green("ok")).toBe("\x1b[32mok\x1b[39m");
    });
  }

  @Test.it("disables when the --no-color option resolves to false")
  noColorOption() {
    let captured: Color | undefined;
    class Show extends Command({
      name: "show",
      options: [{ name: "--no-color" }],
      middleware: [color()],
    }) {
      execute() {
        captured = this.color;
      }
    }
    const h = harness({ name: "tool", commands: [Show] });
    return h.run(["show", "--no-color"]).then(() => {
      expect(captured?.enabled).toBe(false);
      expect(captured?.red("x")).toBe("x");
    });
  }
}

await TestApplication().addTests(ColorSuite).reporter(new ConsoleReporter()).run();
