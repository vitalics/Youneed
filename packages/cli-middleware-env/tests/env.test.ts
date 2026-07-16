import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { env, t } from "../src/index.ts";

function harness(config: Parameters<typeof Application>[0]) {
  let code = 0;
  const err: string[] = [];
  const app = Application({
    ...config,
    autoRun: false,
    stdout() {},
    stderr: (l) => err.push(l),
    exit: (c) => (code = c),
  });
  return {
    err,
    get code() {
      return code;
    },
    async run(argv: string[]) {
      code = await app.run(argv);
      return code;
    },
  };
}

class EnvSuite extends Test({ name: "cli-middleware-env" }) {
  @Test.it("parses & coerces a typed this.env from the source")
  parses() {
    let port: number | undefined;
    let mode: string | undefined;
    const schema = { PORT: t.port().default(3000), NODE_ENV: t.enum(["dev", "prod"]) };
    class Serve extends Command({
      name: "serve",
      middleware: [env(schema, { source: { NODE_ENV: "prod" } })],
    }) {
      execute() {
        // typed: PORT is number, NODE_ENV is "dev" | "prod"
        port = this.env.PORT;
        mode = this.env.NODE_ENV;
      }
    }
    const h = harness({ name: "tool", commands: [Serve] });
    return h.run(["serve"]).then(() => {
      expect(h.code).toBe(0);
      expect(port).toBe(3000);
      expect(mode).toBe("prod");
    });
  }

  @Test.it("fails fast (exit 1) when a required variable is invalid")
  failsFast() {
    const schema = { NODE_ENV: t.enum(["dev", "prod"]) };
    class Serve extends Command({
      name: "serve",
      middleware: [env(schema, { source: { NODE_ENV: "staging" } })],
    }) {
      execute() {}
    }
    const h = harness({ name: "tool", commands: [Serve] });
    return h.run(["serve"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("invalid environment"))).toBe(true);
    });
  }
}

await TestApplication().addTests(EnvSuite).reporter(new ConsoleReporter()).run();
