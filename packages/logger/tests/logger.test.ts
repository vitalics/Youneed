// Run: pnpm --filter @youneed/logger test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { PassThrough } from "node:stream";
import {
  createLogger,
  createTransport,
  ConsoleTransport,
  StreamTransport,
  format,
  supportsColor,
  MESSAGE,
  type TransformableInfo,
  type ConsoleLike,
} from "../src/index.ts";

// A capture transport that collects rendered lines into the given array.
const capture = (lines: string[], level?: string) =>
  createTransport({ level, log: (info) => lines.push(String(info[MESSAGE])) });

class LevelSuite extends Test({ name: "logger: levels" }) {
  @Test.it("respects the logger level (debug suppressed at info)")
  levels() {
    const lines: string[] = [];
    const log = createLogger({ level: "info", format: format.json(), transports: [capture(lines)] });
    log.debug("nope");
    log.info("yes");
    log.error("err");
    const levels = lines.map((l) => JSON.parse(l).level);
    expect(levels).toEqual(["info", "error"]);
  }

  @Test.it("honors a per-transport level independent of the logger level")
  perTransport() {
    const all: string[] = [];
    const errorsOnly: string[] = [];
    const log = createLogger({
      level: "debug", // logger lets everything through
      format: format.json(),
      transports: [capture(all), capture(errorsOnly, "error")],
    });
    log.info("i");
    log.error("e");
    expect(all.length).toBe(2);
    expect(errorsOnly.length).toBe(1);
    expect(JSON.parse(errorsOnly[0]).level).toBe("error");
  }
}

class FormatSuite extends Test({ name: "logger: formats" }) {
  @Test.it("json() emits level/message + merged meta with correct precedence")
  json() {
    const lines: string[] = [];
    const log = createLogger({
      format: format.json(),
      defaultMeta: { service: "api", env: "test" },
      transports: [capture(lines)],
    }).child({ requestId: "r1", env: "child" });
    log.info("hello", { env: "call", extra: 1 });
    const rec = JSON.parse(lines[0]);
    expect(rec.level).toBe("info");
    expect(rec.message).toBe("hello");
    expect(rec.service).toBe("api");
    expect(rec.requestId).toBe("r1");
    expect(rec.extra).toBe(1);
    expect(rec.env).toBe("call"); // per-call > child > defaultMeta
  }

  @Test.it("combine(timestamp,json) yields a deterministic timestamp")
  timestamp() {
    const lines: string[] = [];
    const log = createLogger({
      format: format.combine(format.timestamp({ format: () => "T0" }), format.json()),
      transports: [capture(lines)],
    });
    log.info("hi");
    expect(JSON.parse(lines[0]).timestamp).toBe("T0");
  }

  @Test.it("printf() renders a custom line")
  printf() {
    const lines: string[] = [];
    const log = createLogger({ format: format.printf((i) => `${i.level}|${String(i.message)}`), transports: [capture(lines)] });
    log.warn("careful");
    expect(lines[0]).toBe("warn|careful");
  }

  @Test.it("colorize() wraps the level but keeps filtering by the real level")
  colorize() {
    const errorsOnly: string[] = [];
    const log = createLogger({
      level: "debug",
      format: format.combine(format.colorize(), format.printf((i) => String(i.level))),
      transports: [capture(errorsOnly, "error")],
    });
    log.info("i"); // filtered out (below error transport level)
    log.error("e"); // passes; level string is colorized
    expect(errorsOnly.length).toBe(1);
    expect(errorsOnly[0].includes("\x1b[")).toBe(true);
  }

  @Test.it("redact() deep-masks secrets without mutating the input meta")
  redact() {
    const lines: string[] = [];
    const log = createLogger({ format: format.combine(format.redact(["ssn"]), format.json()), transports: [capture(lines)] });
    const input = { user: { password: "p", name: "ada" }, headers: { authorization: "Bearer x" }, ssn: "123" };
    log.info("m", input);
    const rec = JSON.parse(lines[0]);
    expect(rec.user.password).toBe("[REDACTED]");
    expect(rec.user.name).toBe("ada");
    expect(rec.headers.authorization).toBe("[REDACTED]");
    expect(rec.ssn).toBe("[REDACTED]");
    expect(input.user.password).toBe("p"); // input untouched
  }
}

class TransportSuite extends Test({ name: "logger: transports" }) {
  @Test.it("add/remove/clear change which transports receive records")
  manage() {
    const a: string[] = [];
    const b: string[] = [];
    const tA = capture(a);
    const tB = capture(b);
    const log = createLogger({ format: format.json(), transports: [tA] });
    log.info("1");
    log.add(tB);
    log.info("2");
    log.remove(tA);
    log.info("3");
    log.clear();
    log.info("4");
    expect(a.length).toBe(2); // "1","2"
    expect(b.length).toBe(2); // "2","3"
    expect(log.transports.length).toBe(0);
  }

  @Test.it("StreamTransport writes the rendered line to a Writable")
  stream() {
    const chunks: string[] = [];
    const sink = new PassThrough();
    sink.on("data", (c: Buffer) => chunks.push(c.toString()));
    const log = createLogger({ format: format.json(), transports: [new StreamTransport({ stream: sink })] });
    log.info("streamed", { n: 5 });
    const out = chunks.join("");
    expect(out.includes('"message":"streamed"')).toBe(true);
    expect(out.endsWith("\n")).toBe(true);
  }

  @Test.it("a custom Transport subclass can be appended")
  custom() {
    const seen: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [createTransport({ log: (i) => seen.push(i) })] });
    log.info("x", { a: 1 });
    expect(seen.length).toBe(1);
    expect(seen[0].a).toBe(1);
  }

  @Test.it("ConsoleTransport routes levels to the matching console method (universal, no process)")
  consoleTransport() {
    const calls: Array<[string, string]> = [];
    const fake: ConsoleLike = {
      log: (m) => calls.push(["log", String(m)]),
      info: (m) => calls.push(["info", String(m)]),
      warn: (m) => calls.push(["warn", String(m)]),
      error: (m) => calls.push(["error", String(m)]),
      debug: (m) => calls.push(["debug", String(m)]),
    };
    const log = createLogger({
      level: "silly",
      format: format.printf((i) => String(i.message)),
      transports: [new ConsoleTransport({ console: fake })],
    });
    log.error("e");
    log.warn("w");
    log.info("i");
    log.http("h");
    log.debug("d");
    log.silly("s");
    expect(calls).toEqual([
      ["error", "e"],
      ["warn", "w"],
      ["info", "i"],
      ["info", "h"],
      ["debug", "d"],
      ["debug", "s"],
    ]);
  }

  @Test.it("ConsoleTransport({ color: true }) tints the whole line by severity")
  colorOn() {
    const out: string[] = [];
    const fake: ConsoleLike = { log: (m) => out.push(String(m)), error: (m) => out.push(String(m)) };
    const log = createLogger({
      format: format.printf((i) => String(i.message)),
      transports: [new ConsoleTransport({ console: fake, color: true })],
    });
    log.error("boom");
    expect(out[0]).toBe("\x1b[31mboom\x1b[0m"); // red + reset
  }

  @Test.it("ConsoleTransport({ color: false }) emits no ANSI")
  colorOff() {
    const out: string[] = [];
    const fake: ConsoleLike = { log: (m) => out.push(String(m)), error: (m) => out.push(String(m)) };
    const log = createLogger({
      format: format.printf((i) => String(i.message)),
      transports: [new ConsoleTransport({ console: fake, color: false })],
    });
    log.error("boom");
    expect(out[0]).toBe("boom");
    expect(out[0].includes("\x1b[")).toBe(false);
  }

  @Test.it("supportsColor() honors NO_COLOR / FORCE_COLOR")
  detect() {
    const env = process.env;
    const save = { NO_COLOR: env.NO_COLOR, FORCE_COLOR: env.FORCE_COLOR };
    try {
      delete env.NO_COLOR;
      env.FORCE_COLOR = "1";
      expect(supportsColor()).toBe(true);
      env.NO_COLOR = "1"; // NO_COLOR wins over FORCE_COLOR
      expect(supportsColor()).toBe(false);
    } finally {
      if (save.NO_COLOR === undefined) delete env.NO_COLOR;
      else env.NO_COLOR = save.NO_COLOR;
      if (save.FORCE_COLOR === undefined) delete env.FORCE_COLOR;
      else env.FORCE_COLOR = save.FORCE_COLOR;
    }
  }
}

class DisposeSuite extends Test({ name: "logger: dispose" }) {
  @Test.it("logger.close() disposes every transport (awaiting async ones) and detaches them")
  async close() {
    const events: string[] = [];
    const sync = createTransport({ log: () => {}, close: () => void events.push("sync") });
    const asyncT = createTransport({
      log: () => {},
      close: async () => {
        await Promise.resolve();
        events.push("async");
      },
    });
    const log = createLogger({ transports: [sync, asyncT] });
    await log.close();
    expect(events).toEqual(["sync", "async"]);
    expect(log.transports.length).toBe(0);
    await log.close(); // idempotent — no double-dispose
    expect(events).toEqual(["sync", "async"]);
  }

  @Test.it("a transport without cleanup is disposed without error")
  noClose() {
    const seen: string[] = [];
    const log = createLogger({ transports: [createTransport({ log: (i) => seen.push(String(i.message)) })] });
    log.info("x");
    log[Symbol.dispose](); // sync `using` path
    expect(seen.length).toBe(1);
    expect(log.transports.length).toBe(0);
  }

  @Test.it("`await using` disposes the logger at scope exit")
  async usingScope() {
    const events: string[] = [];
    const make = () =>
      createLogger({ transports: [createTransport({ log: () => {}, close: () => void events.push("closed") })] });
    {
      await using log = make();
      log.info("in scope");
      expect(events.length).toBe(0);
    }
    expect(events).toEqual(["closed"]); // disposed on block exit
  }
}

class PluginSuite extends Test({ name: "logger: plugins" }) {
  @Test.it("a plugin installs at construction and can enrich via defaults()")
  install() {
    const lines: string[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(lines)],
      plugins: [{ name: "tag", install: (l) => void l.defaults({ service: "api", region: "eu" }) }],
    });
    log.info("hi", { region: "us" }); // per-call meta overrides plugin default
    const rec = JSON.parse(lines[0]);
    expect(rec.service).toBe("api");
    expect(rec.region).toBe("us");
  }

  @Test.it("logger.use() installs at runtime and a returned disposable is torn down on close()")
  async disposeOnClose() {
    const events: string[] = [];
    const log = createLogger({ transports: [createTransport({ log: () => {} })] });
    log.use({
      name: "res",
      install: () => ({ [Symbol.dispose]: () => void events.push("disposed") }),
    });
    expect(events).toEqual([]);
    await log.close();
    expect(events).toEqual(["disposed"]);
  }

  @Test.it("defaults() does not mutate the caller's defaultMeta object")
  noMutate() {
    const base = { service: "api" };
    const lines: string[] = [];
    const log = createLogger({
      format: format.json(),
      defaultMeta: base,
      transports: [capture(lines)],
      plugins: [{ name: "x", install: (l) => void l.defaults({ added: 1 }) }],
    });
    log.info("m");
    expect(JSON.parse(lines[0]).added).toBe(1);
    expect("added" in base).toBe(false); // caller's object untouched
  }
}

await TestApplication()
  .addTests(LevelSuite)
  .addTests(FormatSuite)
  .addTests(TransportSuite)
  .addTests(DisposeSuite)
  .addTests(PluginSuite)
  .reporter(new ConsoleReporter())
  .run();
