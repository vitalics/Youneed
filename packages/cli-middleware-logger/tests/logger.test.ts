import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { createLogger, type Logger } from "@youneed/logger";
import { logger } from "../src/index.ts";

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

class LoggerSuite extends Test({ name: "cli-middleware-logger" }) {
  @Test.it("contributes this.logger and logs without throwing")
  contributes() {
    let seen: Logger | undefined;
    const base = createLogger({ level: "info", transports: [] });
    class Run extends Command({ name: "run", middleware: [logger(base)] }) {
      execute() {
        seen = this.logger;
        this.logger.info("hello");
      }
    }
    const h = harness({ name: "tool", version: "1.0.0", commands: [Run] });
    return h.run(["run"]).then(() => {
      expect(h.code).toBe(0);
      expect(typeof seen?.info).toBe("function");
    });
  }

  @Test.it("lowers the level to debug with --verbose")
  verbose() {
    let level: string | undefined;
    const base = createLogger({ level: "info", transports: [] });
    class Run extends Command({
      name: "run",
      options: [{ name: "-v, --verbose" }],
      middleware: [logger(base)],
    }) {
      execute() {
        level = this.logger.level;
      }
    }
    const h = harness({ name: "tool", commands: [Run] });
    return h.run(["run", "--verbose"]).then(() => {
      expect(level).toBe("debug");
    });
  }

  @Test.it("raises the level to warn with --quiet")
  quiet() {
    let level: string | undefined;
    class Run extends Command({
      name: "run",
      options: [{ name: "-q, --quiet" }],
      middleware: [logger({ level: "info", transports: [] })],
    }) {
      execute() {
        level = this.logger.level;
      }
    }
    const h = harness({ name: "tool", commands: [Run] });
    return h.run(["run", "--quiet"]).then(() => {
      expect(level).toBe("warn");
    });
  }
}

await TestApplication().addTests(LoggerSuite).reporter(new ConsoleReporter()).run();
