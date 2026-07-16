// Run: pnpm --filter @youneed/logger-plugin-i18n test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, createTransport, format, type TransformableInfo } from "@youneed/logger";
import { createI18n } from "@youneed/i18n";
import { i18nPlugin } from "../src/index.ts";

const capture = (sink: TransformableInfo[]) => createTransport({ log: (i) => sink.push(i) });

const makeI18n = () =>
  createI18n({
    resources: {
      en: { "server.started": "Listening on :{port}", "user.login": "{name} logged in" },
      de: { "server.started": "Lauscht auf :{port}", "user.login": "{name} hat sich angemeldet" },
    },
    locale: "en",
    fallbackLocale: "en",
  });

class I18nLoggerSuite extends Test({ name: "logger-plugin-i18n" }) {
  @Test.it("translates a known message key, interpolating from meta") translate() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [i18nPlugin(makeI18n())] });
    log.info("server.started", { port: 3000 });
    expect(sink[0].message).toBe("Listening on :3000");
  }

  @Test.it("leaves an unknown message untouched") passthrough() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [i18nPlugin(makeI18n())] });
    log.info("just a plain string");
    expect(sink[0].message).toBe("just a plain string");
  }

  @Test.it("follows the translator's active locale") locale() {
    const i18n = makeI18n();
    const sink: TransformableInfo[] = [];
    const log = createLogger({ format: format.json(), transports: [capture(sink)], plugins: [i18nPlugin(i18n)] });
    i18n.setLocale("de");
    log.info("user.login", { name: "Ada" });
    expect(sink[0].message).toBe("Ada hat sich angemeldet");
  }

  @Test.it("paramsKey scopes interpolation to one meta field") paramsKey() {
    const sink: TransformableInfo[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(sink)],
      plugins: [i18nPlugin(makeI18n(), { paramsKey: "vars" })],
    });
    log.info("server.started", { vars: { port: 8080 }, port: 1 });
    expect(sink[0].message).toBe("Listening on :8080");
  }

  @Test.it("localeKey stamps the resolved locale") localeKey() {
    const i18n = makeI18n();
    const sink: TransformableInfo[] = [];
    const log = createLogger({
      format: format.json(),
      transports: [capture(sink)],
      plugins: [i18nPlugin(i18n, { localeKey: "locale" })],
    });
    i18n.setLocale("de");
    log.info("server.started", { port: 3000 });
    expect(sink[0].locale).toBe("de");
  }
}

await TestApplication().addTests(I18nLoggerSuite).reporter(new ConsoleReporter()).run();
