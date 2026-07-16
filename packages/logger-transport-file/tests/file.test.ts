// Run: pnpm --filter @youneed/logger-transport-file test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, format } from "@youneed/logger";
import { FileTransport, file } from "../src/index.ts";

class FileSuite extends Test({ name: "logger-transport-file" }) {
  @Test.it("sync mode appends each rendered record as a newline-terminated line")
  sync() {
    const dir = mkdtempSync(join(tmpdir(), "lf-"));
    const path = join(dir, "app.log");
    try {
      const log = createLogger({ format: format.json(), transports: [new FileTransport({ filename: path })] });
      log.info("one", { n: 1 });
      log.error("two");
      const lines = readFileSync(path, "utf8").trimEnd().split("\n");
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).message).toBe("one");
      expect(JSON.parse(lines[0]).n).toBe(1);
      expect(JSON.parse(lines[1]).level).toBe("error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @Test.it("stream mode flushes to disk after close()")
  async stream() {
    const dir = mkdtempSync(join(tmpdir(), "lf-"));
    const path = join(dir, "stream.log");
    try {
      const t = file({ filename: path, stream: true });
      const log = createLogger({ format: format.json(), transports: [t] });
      log.info("buffered");
      await t.close();
      const out = readFileSync(path, "utf8");
      expect(out.includes('"message":"buffered"')).toBe(true);
      expect(out.endsWith("\n")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @Test.it("`await using` / logger.close() drains the stream transport")
  async dispose() {
    const dir = mkdtempSync(join(tmpdir(), "lf-"));
    const path = join(dir, "disposed.log");
    try {
      {
        await using t = file({ filename: path, stream: true });
        const log = createLogger({ format: format.json(), transports: [t] });
        log.info("via using");
      } // t disposed here → stream flushed + closed
      const out = readFileSync(path, "utf8");
      expect(out.includes('"message":"via using"')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

await TestApplication().addTests(FileSuite).reporter(new ConsoleReporter()).run();
