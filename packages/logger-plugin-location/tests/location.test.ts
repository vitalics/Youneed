// Run: pnpm --filter @youneed/logger-plugin-location test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, createTransport, format, type TransformableInfo } from "@youneed/logger";
import { location, locationPlugin } from "../src/index.ts";

const capture = (sink: TransformableInfo[]) => createTransport({ log: (i) => sink.push(i) });

class LocationSuite extends Test({ name: "logger-plugin-location" }) {
  @Test.it("stamps a relative file:line:column for the caller's frame")
  stamps() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [locationPlugin()] });
    log.info("hi"); // ← the call site this test asserts on
    const loc = String(sink[0].location);
    expect(loc.includes("location.test.ts:")).toBe(true);
    expect(/location\.test\.ts:\d+:\d+$/.test(loc)).toBe(true);
    expect(loc.startsWith("/")).toBe(false); // relative, not absolute
  }

  @Test.it("does not leak the logger core or this plugin as the call site")
  notInternal() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [locationPlugin()] });
    log.error("boom");
    const loc = String(sink[0].location);
    expect(loc.includes("packages/logger/")).toBe(false); // not the core
    expect(loc.includes("src/index.ts")).toBe(false); // not the plugin itself
  }

  @Test.it("column:false drops the column; message:true prepends to the message")
  options() {
    const noCol: TransformableInfo[] = [];
    const log1 = createLogger({ format: format.json(), transports: [capture(noCol)], plugins: [locationPlugin({ column: false })] });
    log1.info("x");
    expect(/location\.test\.ts:\d+$/.test(String(noCol[0].location))).toBe(true);

    const inMsg: TransformableInfo[] = [];
    const log2 = createLogger({ format: format.json(), transports: [capture(inMsg)], plugins: [locationPlugin({ message: true })] });
    log2.warn("careful");
    expect(/location\.test\.ts:\d+:\d+ careful$/.test(String(inMsg[0].message))).toBe(true);
  }

  @Test.it("location() works as a plain format inside combine() before json()")
  asFormat() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.combine(location(), format.json()), transports: [capture(sink)] });
    log.info("via format");
    // location() ran first, so the json() the user composed serialized the field too:
    expect(typeof sink[0].location).toBe("string");
    expect(String(sink[0].location).includes("location.test.ts:")).toBe(true);
  }
}

await TestApplication().addTests(LocationSuite).reporter(new ConsoleReporter()).run();
