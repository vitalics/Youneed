// Run: pnpm --filter @youneed/logger-plugin-datadog test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, createTransport, format, type TransformableInfo } from "@youneed/logger";
import { datadog } from "../src/index.ts";

const capture = (sink: TransformableInfo[]) => createTransport({ log: (i) => sink.push(i) });

class DatadogSuite extends Test({ name: "logger-plugin-datadog" }) {
  @Test.it("stamps ddsource/service/ddtags on every record; per-call meta still wins")
  enriches() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(sink)],
      plugins: [datadog({ service: "api", env: "prod", version: "1.4.0", tags: { team: "core" } })],
    });
    log.info("up", { port: 3000, service: "override" });
    const rec = sink[0];
    expect(rec.ddsource).toBe("nodejs");
    expect(rec.ddtags).toBe("env:prod,version:1.4.0,team:core");
    expect(rec.port).toBe(3000);
    expect(rec.service).toBe("override"); // per-call meta overrides the default
  }

  @Test.it("falls back to DD_* env and is inherited by child loggers")
  envAndChild() {
    const env = process.env;
    const save = { DD_SERVICE: env.DD_SERVICE, DD_ENV: env.DD_ENV };
    try {
      env.DD_SERVICE = "billing";
      env.DD_ENV = "staging";
      const sink: TransformableInfo[] = [];
      const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [datadog()] });
      log.child({ requestId: "r1" }).info("hi");
      const rec = sink[0];
      expect(rec.service).toBe("billing");
      expect(rec.ddtags).toBe("env:staging");
      expect(rec.requestId).toBe("r1"); // child bindings preserved alongside plugin defaults
    } finally {
      if (save.DD_SERVICE === undefined) delete env.DD_SERVICE;
      else env.DD_SERVICE = save.DD_SERVICE;
      if (save.DD_ENV === undefined) delete env.DD_ENV;
      else env.DD_ENV = save.DD_ENV;
    }
  }
}

await TestApplication().addTests(DatadogSuite).reporter(new ConsoleReporter()).run();
