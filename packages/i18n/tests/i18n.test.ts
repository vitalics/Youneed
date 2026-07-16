// Run: pnpm --filter @youneed/i18n test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createI18n } from "../src/index.ts";

const i18n = createI18n({
  resources: {
    en: { greeting: "Hello {name}", nav: { home: "Home", away: "Away" } },
    de: { greeting: "Hallo {name}", nav: { home: "Startseite" } },
  },
  locale: "en",
  fallbackLocale: "en",
});

class I18nSuite extends Test({ name: "i18n" }) {
  @Test.afterEach() reset() {
    i18n.setLocale("en");
  }

  @Test.it("interpolates params") interpolate() {
    expect(i18n("greeting", { name: "Ada" })).toBe("Hello Ada");
  }

  @Test.it("resolves nested dotted keys") nested() {
    expect(i18n("nav.home")).toBe("Home");
  }

  @Test.it("switches locale") switchLocale() {
    i18n.setLocale("de");
    expect(i18n("greeting", { name: "Ada" })).toBe("Hallo Ada");
  }

  @Test.it("falls back when a key is missing in the active locale") fallback() {
    i18n.setLocale("de");
    expect(i18n("nav.away")).toBe("Away"); // only in `en`
  }

  @Test.it("returns the key for an unknown key by default") missing() {
    expect(i18n("nav.nope")).toBe("nav.nope");
  }

  @Test.it("has() reports key presence") has() {
    expect(i18n.has("nav.home")).toBeTruthy();
    expect(i18n.has("nav.nope")).toBeFalsy();
  }

  @Test.it("exposes locale + locales") meta() {
    expect(i18n.locale).toBe("en");
    expect(i18n.locales.includes("de")).toBeTruthy();
  }

  @Test.it("notifies subscribers on locale change") subscribe() {
    let seen = "";
    const off = i18n.subscribe((l) => (seen = l));
    i18n.setLocale("de");
    expect(seen).toBe("de");
    off();
    i18n.setLocale("en");
    expect(seen).toBe("de"); // no longer notified
  }

  @Test.it("ignores unknown / no-op locale changes") noop() {
    let calls = 0;
    const off = i18n.subscribe(() => calls++);
    i18n.setLocale("en"); // same as current
    i18n.setLocale("fr" as never); // unknown
    expect(calls).toBe(0);
    off();
  }
}

// ── plurals (Intl.PluralRules) ──────────────────────────────────────────────────
const plural = createI18n({
  resources: {
    en: { items: { one: "{count} item", other: "{count} items" }, place: { one: "{count}st", two: "{count}nd", few: "{count}rd", other: "{count}th" } },
    ru: { items: { one: "{count} товар", few: "{count} товара", many: "{count} товаров", other: "{count} товара" } },
  },
  locale: "en",
  fallbackLocale: "en",
});

class PluralSuite extends Test({ name: "i18n: plurals" }) {
  @Test.afterEach() reset() {
    plural.setLocale("en");
  }

  @Test.it("selects one/other in English") english() {
    expect(plural("items", { count: 1 })).toBe("1 item");
    expect(plural("items", { count: 5 })).toBe("5 items");
    expect(plural("items", { count: 0 })).toBe("0 items");
  }

  @Test.it("selects one/few/many in Russian") russian() {
    plural.setLocale("ru");
    expect(plural("items", { count: 1 })).toBe("1 товар"); // one
    expect(plural("items", { count: 3 })).toBe("3 товара"); // few
    expect(plural("items", { count: 5 })).toBe("5 товаров"); // many
  }

  @Test.it("supports ordinal selection") ordinal() {
    expect(plural("place", { count: 1, ordinal: true })).toBe("1st");
    expect(plural("place", { count: 2, ordinal: true })).toBe("2nd");
    expect(plural("place", { count: 3, ordinal: true })).toBe("3rd");
    expect(plural("place", { count: 11, ordinal: true })).toBe("11th");
  }

  @Test.it("falls back to `other` when no count is given") noCount() {
    expect(plural("items")).toBe("{count} items");
  }

  @Test.it("a plural key is reported by has()") has() {
    expect(plural.has("items")).toBeTruthy();
  }
}

await TestApplication().addTests(I18nSuite, PluralSuite).reporter(new ConsoleReporter()).run();
