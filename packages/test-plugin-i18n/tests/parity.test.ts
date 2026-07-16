// Run: pnpm --filter @youneed/test-plugin-i18n test
import { Test, TestApplication, expect, AssertionError } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createI18n } from "@youneed/i18n";
import { parity, assertParity, formatReport, eachLocale } from "../src/index.ts";

const complete = {
  en: { greeting: "Hello {name}", nav: { home: "Home" } },
  de: { greeting: "Hallo {name}", nav: { home: "Startseite" } },
};

const broken = {
  en: { greeting: "Hello {name}", nav: { home: "Home", away: "Away" } },
  de: { greeting: "Hallo {firstName}", nav: { home: "Startseite" }, extra: "x" },
};

class ParitySuite extends Test({ name: "test-plugin-i18n" }) {
  @Test.it("complete resources pass") ok() {
    const r = parity(complete);
    expect(r.complete).toBeTruthy();
    expect(r.issues.length).toBe(0);
  }

  @Test.it("flags missing, extra and placeholder drift") flags() {
    const r = parity(broken, { base: "en" });
    expect(r.complete).toBeFalsy();
    const de = r.issues.find((i) => i.locale === "de")!;
    expect(de.missing.join(",")).toBe("nav.away");
    expect(de.extra.join(",")).toBe("extra");
    expect(de.placeholderMismatches[0].key).toBe("greeting");
  }

  @Test.it("checkPlaceholders:false ignores placeholder drift") noPlaceholders() {
    const r = parity({ en: { a: "{x}" }, de: { a: "{y}" } }, { checkPlaceholders: false });
    expect(r.complete).toBeTruthy();
  }

  @Test.it("assertParity passes silently when complete") assertOk() {
    assertParity(complete); // must not throw
    expect(true).toBeTruthy();
  }

  @Test.it("assertParity throws an AssertionError when broken") assertThrows() {
    let err: unknown;
    try {
      assertParity(broken);
    } catch (e) {
      err = e;
    }
    expect(err instanceof AssertionError).toBeTruthy();
    expect(String((err as Error).message).includes("nav.away")).toBeTruthy();
  }

  @Test.it("formatReport summarizes a clean run") format() {
    expect(formatReport(parity(complete)).includes("OK")).toBeTruthy();
  }

  @Test.it("plural keys are compared as one leaf, not per category") plurals() {
    const r = parity({
      en: { items: { one: "{count} item", other: "{count} items" } },
      ru: { items: { one: "{count} товар", few: "{count} товара", many: "{count} товаров", other: "{count} товара" } },
    });
    expect(r.complete).toBeTruthy(); // ru's extra `few`/`many` are NOT "extra keys"
  }

  @Test.it("eachLocale visits every locale and restores the original") each() {
    const i18n = createI18n({ resources: complete, locale: "en" });
    const seen: string[] = [];
    eachLocale(i18n, (l) => seen.push(l));
    expect(seen.join(",")).toBe("en,de");
    expect(i18n.locale).toBe("en"); // restored
  }
}

await TestApplication().addTests(ParitySuite).reporter(new ConsoleReporter()).run();
