// Run: pnpm --filter @youneed/logger-plugin-exception test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, createTransport, format, type TransformableInfo } from "@youneed/logger";
import { exceptionHandler } from "../src/index.ts";

const capture = (sink: TransformableInfo[]) => createTransport({ log: (i) => sink.push(i) });

class ExceptionSuite extends Test({ name: "logger-plugin-exception" }) {
  @Test.it("logs an uncaughtException as a structured error record (exitOnError:false)")
  exception() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(sink)],
      plugins: [exceptionHandler({ exitOnError: false })],
    });
    try {
      process.emit("uncaughtException", new TypeError("boom"));
      expect(sink.length).toBe(1);
      expect(sink[0].level).toBe("error");
      expect(sink[0].message).toBe("uncaughtException");
      expect(sink[0].exception).toBe(true);
      const err = sink[0].error as { name: string; message: string; stack?: string };
      expect(err.name).toBe("TypeError");
      expect(err.message).toBe("boom");
    } finally {
      void log.close();
    }
  }

  @Test.it("logs an unhandledRejection and honors handleExceptions:false")
  rejection() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(sink)],
      plugins: [exceptionHandler({ exitOnError: false, handleExceptions: false })],
    });
    try {
      process.emit("uncaughtException", new Error("ignored")); // no exception listener from us
      process.emit("unhandledRejection", new Error("nope"), Promise.resolve());
      expect(sink.length).toBe(1); // only the rejection
      expect(sink[0].message).toBe("unhandledRejection");
      expect(sink[0].rejection).toBe(true);
    } finally {
      void log.close();
    }
  }

  @Test.it("close() detaches the process listeners")
  async detaches() {
    const before = process.listenerCount("uncaughtException");
    const sink: TransformableInfo[] = [];
    const log = createLogger({ transports: [capture(sink)], plugins: [exceptionHandler({ exitOnError: false })] });
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
    await log.close();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  }
}

await TestApplication().addTests(ExceptionSuite).reporter(new ConsoleReporter()).run();
