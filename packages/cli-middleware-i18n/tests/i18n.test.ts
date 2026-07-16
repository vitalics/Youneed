import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { createI18n } from "@youneed/i18n";
import { i18n } from "../src/index.ts";

const resources = {
  en: { hi: "Hello {name}" },
  ru: { hi: "Привет {name}" },
};

class I18nSuite extends Test({ name: "cli-middleware-i18n" }) {
  @Test.it("contributes this.i18n and translates")
  translates() {
    let out = "";
    class Greet extends Command("greet <name>", { middleware: [i18n({ resources, locale: "en" })] }) {
      execute(name: string) {
        out = this.i18n.t("hi", { name });
      }
    }
    const app = Application({ name: "t", commands: [Greet], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["greet", "Sam"]).then(() => expect(out).toBe("Hello Sam"));
  }

  @Test.it("switches locale from the --locale option")
  localeOption() {
    let out = "";
    class Greet extends Command("greet <name>", {
      options: [{ name: "--locale <l>" }],
      middleware: [i18n({ resources, locale: "en" })],
    }) {
      execute(name: string) {
        out = this.i18n.t("hi", { name });
      }
    }
    const app = Application({ name: "t", commands: [Greet], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["greet", "Сэм", "--locale", "ru"]).then(() => expect(out).toBe("Привет Сэм"));
  }

  @Test.it("accepts a ready-made instance")
  readyInstance() {
    let out = "";
    const inst = createI18n({ resources, locale: "ru" });
    class Greet extends Command("greet <name>", { middleware: [i18n(inst)] }) {
      execute(name: string) {
        out = this.i18n.t("hi", { name });
      }
    }
    const app = Application({ name: "t", commands: [Greet], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["greet", "X"]).then(() => expect(out).toBe("Привет X"));
  }
}

await TestApplication().addTests(I18nSuite).reporter(new ConsoleReporter()).run();
