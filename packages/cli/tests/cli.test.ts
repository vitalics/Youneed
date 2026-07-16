import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import {
  Application,
  Command,
  Option,
  option,
  defaultOptions,
  t,
  type CliMiddleware,
  type StandardSchemaV1,
} from "../src/index.ts";

// A hand-rolled Standard Schema (no zod/valibot dependency in tests) that parses
// a positive integer — exercises the `schema:` path end to end.
const positiveInt: StandardSchemaV1<unknown, number> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(value) {
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) return { issues: [{ message: "expected a positive integer" }] };
      return { value: n };
    },
  },
};

// A test harness that captures output and runs without touching process state.
function harness(config: Parameters<typeof Application>[0]) {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  const app = Application({
    ...config,
    autoRun: false,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    exit: (c) => (code = c),
  });
  return {
    app,
    out,
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

class FirstOption extends Option("--first", {
  short: "f",
  description: "display just the first substring",
}) {}

class SplitCommand extends Command({
  name: "split <string>",
  description: "Split a string into substrings and display as an array",
  options: [
    FirstOption,
    { name: "-s, --separator <char>", description: "separator character", default: "," },
    ...defaultOptions(),
  ],
}) {
  result: string[] = [];
  execute(value: string) {
    // Type assertions: `this.options.first` is boolean, `.separator` is string.
    const first: boolean = this.options.first;
    const separator: string = this.options.separator;
    const limit = first ? 1 : undefined;
    this.result = value.split(separator, limit);
  }
}

class ExecSuite extends Test({ name: "cli: command execution" }) {
  @Test.it("parses a positional argument and a value option")
  positionalAndValue() {
    let captured: string[] = [];
    class Spy extends SplitCommand {
      override execute(value: string) {
        super.execute(value);
        captured = this.result;
      }
    }
    const h = harness({ name: "string-util", commands: [Spy], options: [...defaultOptions()] });
    return h.run(["split", "a,b,c"]).then(() => {
      expect(h.code).toBe(0);
      expect(captured).toEqual(["a", "b", "c"]);
    });
  }

  @Test.it("applies a boolean flag (--first → limit 1)")
  booleanFlag() {
    let captured: string[] = [];
    class Spy extends SplitCommand {
      override execute(value: string) {
        super.execute(value);
        captured = this.result;
      }
    }
    const h = harness({ name: "string-util", commands: [Spy] });
    return h.run(["split", "a,b,c", "--first"]).then(() => {
      expect(captured).toEqual(["a"]);
    });
  }

  @Test.it("honours short alias and a custom separator value")
  shortAndSeparator() {
    let captured: string[] = [];
    class Spy extends SplitCommand {
      override execute(value: string) {
        super.execute(value);
        captured = this.result;
      }
    }
    const h = harness({ name: "string-util", commands: [Spy] });
    return h.run(["split", "a-b-c", "-s", "-", "-f"]).then(() => {
      expect(captured).toEqual(["a"]);
    });
  }

  @Test.it("supports --opt=value form")
  inlineValue() {
    let captured: string[] = [];
    class Spy extends SplitCommand {
      override execute(value: string) {
        super.execute(value);
        captured = this.result;
      }
    }
    const h = harness({ name: "string-util", commands: [Spy] });
    return h.run(["split", "a.b", "--separator=."]).then(() => {
      expect(captured).toEqual(["a", "b"]);
    });
  }
}

class ErrorSuite extends Test({ name: "cli: errors & validation" }) {
  @Test.it("reports a missing required argument")
  missingArg() {
    const h = harness({ name: "string-util", commands: [SplitCommand] });
    return h.run(["split"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("missing required argument"))).toBe(true);
    });
  }

  @Test.it("reports an unknown option")
  unknownOption() {
    const h = harness({ name: "string-util", commands: [SplitCommand] });
    return h.run(["split", "x", "--nope"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("unknown option"))).toBe(true);
    });
  }

  @Test.it("reports an unknown command")
  unknownCommand() {
    const h = harness({ name: "string-util", commands: [SplitCommand] });
    return h.run(["frobnicate"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("unknown command"))).toBe(true);
    });
  }
}

class HelpSuite extends Test({ name: "cli: help & version" }) {
  @Test.it("prints version with --version")
  version() {
    const h = harness({
      name: "string-util",
      version: "0.0.8",
      commands: [SplitCommand],
      options: [...defaultOptions()],
    });
    return h.run(["--version"]).then(() => {
      expect(h.code).toBe(0);
      expect(h.out.join("\n")).toBe("0.0.8");
    });
  }

  @Test.it("prints program help listing the command")
  programHelp() {
    const h = harness({
      name: "string-util",
      description: "CLI to some JavaScript string utilities",
      commands: [SplitCommand],
      options: [...defaultOptions()],
    });
    return h.run(["--help"]).then(() => {
      const text = h.out.join("\n");
      expect(text.includes("Usage: string-util")).toBe(true);
      expect(text.includes("split <string>")).toBe(true);
      expect(text.includes("Commands:")).toBe(true);
    });
  }

  @Test.it("prints command help with --help after the command")
  commandHelp() {
    const h = harness({ name: "string-util", commands: [SplitCommand] });
    return h.run(["split", "--help"]).then(() => {
      const text = h.out.join("\n");
      expect(text.includes("Usage: string-util split <string>")).toBe(true);
      expect(text.includes("--separator")).toBe(true);
      expect(text.includes('(default: ",")')).toBe(true);
    });
  }

  @Test.it("supports the built-in `help <command>` command")
  helpCommand() {
    const h = harness({ name: "string-util", commands: [SplitCommand] });
    return h.run(["help", "split"]).then(() => {
      expect(h.out.join("\n").includes("Usage: string-util split")).toBe(true);
    });
  }
}

class VariadicSuite extends Test({ name: "cli: variadic args & options" }) {
  @Test.it("collects a variadic positional argument")
  variadicPositional() {
    let captured: string[] = [];
    class Join extends Command({ name: "join <parts...>" }) {
      execute(...parts: string[]) {
        captured = parts;
      }
    }
    const h = harness({ name: "tool", commands: [Join] });
    return h.run(["join", "a", "b", "c"]).then(() => {
      expect(captured).toEqual(["a", "b", "c"]);
    });
  }
}

class TypedSuite extends Test({ name: "cli: typed options (type/schema)" }) {
  @Test.it("coerces a value with type: Number")
  numberType() {
    let captured: unknown;
    class Repeat extends Command({
      name: "repeat <text>",
      options: [{ name: "--times <n>", type: Number, default: 1 }],
    }) {
      execute(text: string) {
        const times: number = this.options.times; // typed as number
        captured = text.repeat(times);
      }
    }
    const h = harness({ name: "tool", commands: [Repeat] });
    return h.run(["repeat", "ab", "--times", "3"]).then(() => {
      expect(captured).toBe("ababab");
    });
  }

  @Test.it("type: Number implies the option takes a value")
  numberImpliesValue() {
    let captured: unknown;
    class Pick extends Command({
      name: "pick",
      options: [{ name: "--index", type: Number, default: 0 }],
    }) {
      execute() {
        captured = this.options.index;
      }
    }
    const h = harness({ name: "tool", commands: [Pick] });
    return h.run(["pick", "--index", "42"]).then(() => {
      expect(captured).toBe(42);
    });
  }

  @Test.it("rejects a non-numeric value for type: Number")
  numberTypeError() {
    class Pick extends Command({ name: "pick", options: [{ name: "--index", type: Number }] }) {
      execute() {}
    }
    const h = harness({ name: "tool", commands: [Pick] });
    return h.run(["pick", "--index", "nope"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("expected a number"))).toBe(true);
    });
  }

  @Test.it("validates & coerces through a Standard Schema")
  schemaCoerce() {
    let captured: unknown;
    class Pick extends Command({
      name: "pick",
      options: [{ name: "--port <p>", schema: positiveInt }],
    }) {
      execute() {
        captured = this.options.port; // inferred as number from the schema
      }
    }
    const h = harness({ name: "tool", commands: [Pick] });
    return h.run(["pick", "--port", "8080"]).then(() => {
      expect(captured).toBe(8080);
    });
  }

  @Test.it("reports a schema validation failure")
  schemaError() {
    class Pick extends Command({
      name: "pick",
      options: [{ name: "--port <p>", schema: positiveInt }],
    }) {
      execute() {}
    }
    const h = harness({ name: "tool", commands: [Pick] });
    return h.run(["pick", "--port", "-1"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("expected a positive integer"))).toBe(true);
    });
  }

  @Test.it("Option() works as a plain function binding, not just a base class")
  functionForm() {
    let captured: unknown;
    const separator = Option("-s, --separator <char>", { default: "," });
    class Split extends Command({ name: "split <s>", options: [separator] }) {
      execute(s: string) {
        const sep: string = this.options.separator;
        captured = s.split(sep);
      }
    }
    const h = harness({ name: "tool", commands: [Split] });
    return h.run(["split", "a|b", "-s", "|"]).then(() => {
      expect(captured).toEqual(["a", "b"]);
    });
  }
}

class UnknownCommandSuite extends Test({ name: "cli: unknown command handling" }) {
  @Test.it("suggests the nearest command by default")
  defaultSuggestion() {
    const h = harness({ name: "tool", commands: [SplitCommand] });
    return h.run(["splt"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("maybe you want 'split'?"))).toBe(true);
    });
  }

  @Test.it("uses a custom unknownCommandHandler when provided")
  customHandler() {
    const seen: string[] = [];
    const h = harness({
      name: "tool",
      commands: [SplitCommand],
      unknownCommandHandler: ({ name, suggestion }) => {
        seen.push(`${name}/${suggestion ?? ""}`);
        return `no such command ${name}`;
      },
    });
    return h.run(["splt"]).then(() => {
      expect(h.code).toBe(1);
      expect(seen).toEqual(["splt/split"]);
      expect(h.err.some((l) => l.includes("no such command splt"))).toBe(true);
    });
  }
}

class RenderSuite extends Test({ name: "cli: declarative render" }) {
  @Test.it("writes a string returned from render")
  renderString() {
    const out: string[] = [];
    class Hi extends Command({ name: "hi <who>" }) {
      render(who: string) {
        return `hello, ${who}`;
      }
    }
    const app = Application({ name: "tool", commands: [Hi], autoRun: false, stdout: (l) => out.push(l) });
    return app.run(["hi", "world"]).then(() => {
      expect(out).toEqual(["hello, world"]);
    });
  }

  @Test.it("writes each item of an array / iterable")
  renderArray() {
    const out: string[] = [];
    class List extends Command({ name: "list" }) {
      render() {
        return ["a", "b", "c"];
      }
    }
    const app = Application({ name: "tool", commands: [List], autoRun: false, stdout: (l) => out.push(l) });
    return app.run(["list"]).then(() => {
      expect(out).toEqual(["a", "b", "c"]);
    });
  }

  @Test.it("streams an async generator chunk by chunk")
  renderAsyncIterable() {
    const out: string[] = [];
    class Stream extends Command({ name: "stream" }) {
      async *render() {
        yield "1";
        yield "2";
        yield "3";
      }
    }
    const app = Application({ name: "tool", commands: [Stream], autoRun: false, stdout: (l) => out.push(l) });
    return app.run(["stream"]).then(() => {
      expect(out).toEqual(["1", "2", "3"]);
    });
  }

  @Test.it("prefers render over execute when both exist")
  renderWins() {
    const out: string[] = [];
    let executed = false;
    class Both extends Command({ name: "both" }) {
      render() {
        return "rendered";
      }
      execute() {
        executed = true;
      }
    }
    const app = Application({ name: "tool", commands: [Both], autoRun: false, stdout: (l) => out.push(l) });
    return app.run(["both"]).then(() => {
      expect(out).toEqual(["rendered"]);
      expect(executed).toBe(false);
    });
  }
}

class DisposeSuite extends Test({ name: "cli: dispose protocol" }) {
  @Test.it("disposes the command via Symbol.asyncDispose after execute")
  disposesCommand() {
    const order: string[] = [];
    class Job extends Command({ name: "job" }) {
      execute() {
        order.push("execute");
      }
      async [Symbol.asyncDispose]() {
        order.push("dispose");
      }
    }
    const h = harness({ name: "tool", commands: [Job] });
    return h.run(["job"]).then(() => {
      expect(order).toEqual(["execute", "dispose"]);
    });
  }

  @Test.it("still disposes the command when execute throws")
  disposesOnError() {
    const order: string[] = [];
    class Job extends Command({ name: "job" }) {
      execute() {
        order.push("execute");
        throw new Error("boom");
      }
      [Symbol.dispose]() {
        order.push("dispose");
      }
    }
    const h = harness({ name: "tool", commands: [Job] });
    return h.run(["job"]).then(() => {
      expect(h.code).toBe(1);
      expect(order).toEqual(["execute", "dispose"]);
    });
  }

  @Test.it("disposes a Disposable returned from middleware install")
  disposesMiddlewareResource() {
    const order: string[] = [];
    const resourceMiddleware = {
      name: "resource",
      install() {
        return {
          [Symbol.asyncDispose]() {
            order.push("mw-dispose");
            return Promise.resolve();
          },
        };
      },
    };
    class Job extends Command({ name: "job", middleware: [resourceMiddleware] }) {
      execute() {
        order.push("execute");
      }
      [Symbol.dispose]() {
        order.push("cmd-dispose");
      }
    }
    const h = harness({ name: "tool", commands: [Job] });
    return h.run(["job"]).then(() => {
      // Command disposed first (registered last), then middleware resource.
      expect(order).toEqual(["execute", "cmd-dispose", "mw-dispose"]);
    });
  }

  @Test.it("disposes resources tracked via ctx.use")
  disposesViaUse() {
    const order: string[] = [];
    const useMiddleware: CliMiddleware = {
      name: "use",
      install(ctx) {
        ctx.use({
          [Symbol.dispose]() {
            order.push("used-dispose");
          },
        });
      },
    };
    class Job extends Command({ name: "job", middleware: [useMiddleware] }) {
      execute() {
        order.push("execute");
      }
    }
    const h = harness({ name: "tool", commands: [Job] });
    return h.run(["job"]).then(() => {
      expect(order).toEqual(["execute", "used-dispose"]);
    });
  }
}

class OptionFactorySuite extends Test({ name: "cli: option() factory & Command(name, config)" }) {
  @Test.it("option() descriptor + Command(name, config) wire up typed options")
  factoryForm() {
    let captured: string | undefined;
    const first = option("--first [arg]", {
      short: "-f",
      schema: t.string(),
      default: "",
    });
    class A extends Command("qwe", { options: [first, ...defaultOptions()] }) {
      execute() {
        const value: string = this.options.first; // typed string from schema
        captured = value;
      }
    }
    const h = harness({ name: "tool", commands: [A] });
    return h.run(["qwe", "--first", "hello"]).then(() => {
      expect(h.code).toBe(0);
      expect(captured).toBe("hello");
    });
  }

  @Test.it("short with a leading dash ('-f') still matches")
  shortWithDash() {
    let captured: string | undefined;
    const first = option("--first <arg>", { short: "-f" });
    class A extends Command("qwe", { options: [first] }) {
      execute() {
        captured = this.options.first;
      }
    }
    const h = harness({ name: "tool", commands: [A] });
    return h.run(["qwe", "-f", "x"]).then(() => {
      expect(captured).toBe("x");
    });
  }

  @Test.it("required option acts as a guard — errors when the flag is absent")
  requiredGuard() {
    const first = option("--first [arg]", { required: true, default: "" });
    class A extends Command("qwe", { options: [first] }) {
      execute() {}
    }
    const h = harness({ name: "tool", commands: [A] });
    return h.run(["qwe"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("required option") && l.includes("--first"))).toBe(true);
    });
  }

  @Test.it("optional value [arg] may be omitted (falls back to default)")
  optionalValuePresent() {
    let captured: unknown;
    const first = option("--first [arg]", { required: true, default: "dflt" });
    class A extends Command("qwe", { options: [first] }) {
      execute() {
        captured = this.options.first;
      }
    }
    const h = harness({ name: "tool", commands: [A] });
    // flag present but no value, and a positional-less command → default used.
    return h.run(["qwe", "--first"]).then(() => {
      expect(h.code).toBe(0);
      expect(captured).toBe("dflt");
    });
  }

  @Test.it("schema validation failure is reported")
  schemaError() {
    const port = option("--port <n>", { schema: t.port() });
    class A extends Command("serve", { options: [port] }) {
      execute() {}
    }
    const h = harness({ name: "tool", commands: [A] });
    return h.run(["serve", "--port", "99999"]).then(() => {
      expect(h.code).toBe(1);
      expect(h.err.some((l) => l.includes("--port"))).toBe(true);
    });
  }
}

class PluginSuite extends Test({ name: "cli: plugins" }) {
  @Test.it("setup sees the catalogue and can register a command")
  async setupAndAddCommand() {
    let seen: string[] = [];
    let ranAdded = false;
    class Added extends Command("added", {}) {
      execute() {
        ranAdded = true;
      }
    }
    const plugin = {
      name: "test",
      setup(host: { commands: readonly { name: string }[]; addCommand: (c: unknown) => void }) {
        seen = host.commands.map((c) => c.name);
        host.addCommand(Added);
      },
    };
    class Existing extends Command("existing", {}) {
      execute() {}
    }
    const h = harness({ name: "tool", commands: [Existing], plugins: [plugin] });
    // The plugin saw the pre-registered command...
    expect(seen).toEqual(["existing"]);
    // ...and the command it added is now runnable.
    await h.run(["added"]);
    expect(ranAdded).toBe(true);
  }

  @Test.it("beforeCommand / afterCommand fire around a run with the exit code")
  async lifecycle() {
    const events: string[] = [];
    const plugin = {
      name: "lifecycle",
      beforeCommand: (info: { command: { name: string } }) => void events.push(`before:${info.command.name}`),
      afterCommand: (_info: unknown, code: number) => void events.push(`after:${code}`),
    };
    class Ok extends Command("ok", {}) {
      execute() {}
    }
    class Boom extends Command("boom", {}) {
      execute() {
        throw new Error("x");
      }
    }
    const h = harness({ name: "tool", commands: [Ok, Boom], plugins: [plugin] });
    await h.run(["ok"]);
    await h.run(["boom"]);
    expect(events).toEqual(["before:ok", "after:0", "before:boom", "after:1"]);
  }
}

await TestApplication()
  .addTests(ExecSuite)
  .addTests(ErrorSuite)
  .addTests(HelpSuite)
  .addTests(VariadicSuite)
  .addTests(TypedSuite)
  .addTests(UnknownCommandSuite)
  .addTests(RenderSuite)
  .addTests(DisposeSuite)
  .addTests(OptionFactorySuite)
  .addTests(PluginSuite)
  .reporter(new ConsoleReporter())
  .run();
