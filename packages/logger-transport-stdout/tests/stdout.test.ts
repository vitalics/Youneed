// Run: pnpm --filter @youneed/logger-transport-stdout test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, format } from "@youneed/logger";
import { StdoutTransport, stdout } from "../src/index.ts";

// Swap process.stdout/stderr.write for the duration of `fn`, capturing chunks.
function captureStd(fn: () => void): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  (process.stdout.write as unknown) = (c: string) => (out.push(String(c)), true);
  (process.stderr.write as unknown) = (c: string) => (err.push(String(c)), true);
  try {
    fn();
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
  return { out, err };
}

class StdoutSuite extends Test({ name: "logger-transport-stdout" }) {
  @Test.it("routes error/warn to stderr and the rest to stdout, newline-terminated")
  routes() {
    const log = createLogger({ level: "debug", format: format.json(), transports: [new StdoutTransport()] });
    const { out, err } = captureStd(() => {
      log.info("i");
      log.warn("w");
      log.error("e");
      log.debug("d");
    });
    expect(out.length).toBe(2); // info, debug
    expect(err.length).toBe(2); // warn, error
    expect(out.every((l) => l.endsWith("\n"))).toBe(true);
    expect(JSON.parse(out[0]).message).toBe("i");
    expect(JSON.parse(err[0]).level).toBe("warn");
  }

  @Test.it("honors a custom stderrLevels set")
  customStderr() {
    const log = createLogger({ level: "debug", format: format.json(), transports: [stdout({ stderrLevels: ["error"] })] });
    const { out, err } = captureStd(() => {
      log.warn("w");
      log.error("e");
    });
    expect(out.length).toBe(1); // warn now on stdout
    expect(err.length).toBe(1); // only error on stderr
    expect(JSON.parse(out[0]).level).toBe("warn");
  }
}

await TestApplication().addTests(StdoutSuite).reporter(new ConsoleReporter()).run();
