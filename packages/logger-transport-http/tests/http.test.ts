// Run: pnpm --filter @youneed/logger-transport-http test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, format } from "@youneed/logger";
import { HttpTransport } from "../src/index.ts";

interface Sent {
  url: string;
  body: string;
}
function fakeFetch(sink: Sent[], fail = false) {
  return (url: string, init: { body: string }) => {
    if (fail) return Promise.reject(new Error("boom"));
    sink.push({ url, body: init.body });
    return Promise.resolve({ ok: true });
  };
}

class HttpSuite extends Test({ name: "logger-transport-http" }) {
  @Test.it("auto-flushes when the buffer reaches batchSize")
  async batch() {
    const sent: Sent[] = [];
    const t = new HttpTransport({ url: "/logs", batchSize: 2, flushInterval: 0, fetch: fakeFetch(sent) });
    const log = createLogger({ format: format.json(), transports: [t] });
    log.info("a");
    expect(sent.length).toBe(0); // buffered
    log.info("b");
    await Promise.resolve(); // let the fire-and-forget flush settle
    expect(sent.length).toBe(1);
    const batch = JSON.parse(sent[0].body);
    expect(batch.length).toBe(2);
    expect(JSON.parse(batch[0]).message).toBe("a"); // default transform = rendered JSON line
  }

  @Test.it("flush() drains a partial buffer and close() flushes the rest")
  async manualFlush() {
    const sent: Sent[] = [];
    const t = new HttpTransport({ url: "/logs", batchSize: 100, flushInterval: 0, fetch: fakeFetch(sent) });
    const log = createLogger({ format: format.json(), transports: [t] });
    log.info("one");
    await t.flush();
    expect(sent.length).toBe(1);
    log.info("two");
    await t.close();
    expect(sent.length).toBe(2);
  }

  @Test.it("a custom transform controls each payload element")
  async transform() {
    const sent: Sent[] = [];
    const t = new HttpTransport({
      url: "/logs",
      batchSize: 1,
      flushInterval: 0,
      fetch: fakeFetch(sent),
      transform: (i) => ({ lvl: i.level, msg: i.message }),
    });
    const log = createLogger({ format: format.json(), transports: [t] });
    log.warn("careful");
    await Promise.resolve();
    expect(JSON.parse(sent[0].body)[0]).toEqual({ lvl: "warn", msg: "careful" });
  }

  @Test.it("swallows send errors but reports them through onError")
  async errors() {
    const errs: unknown[] = [];
    const t = new HttpTransport({ url: "/logs", batchSize: 1, flushInterval: 0, fetch: fakeFetch([], true), onError: (e) => errs.push(e) });
    const log = createLogger({ format: format.json(), transports: [t] });
    log.error("kaboom");
    await t.flush(); // must not throw
    expect(errs.length).toBeGreaterThan(0);
  }

  @Test.it("`await using` flushes the buffer on scope exit")
  async dispose() {
    const sent: Sent[] = [];
    {
      await using t = new HttpTransport({ url: "/logs", batchSize: 100, flushInterval: 0, fetch: fakeFetch(sent) });
      const log = createLogger({ format: format.json(), transports: [t] });
      log.info("buffered");
      expect(sent.length).toBe(0); // still buffered inside the scope
    } // disposed → flushed
    expect(sent.length).toBe(1);
    expect(JSON.parse(JSON.parse(sent[0].body)[0]).message).toBe("buffered");
  }
}

await TestApplication().addTests(HttpSuite).reporter(new ConsoleReporter()).run();
