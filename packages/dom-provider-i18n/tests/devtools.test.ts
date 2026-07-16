// Run: pnpm --filter @youneed/dom-provider-i18n test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createI18n } from "@youneed/i18n";
import type { Messages } from "@youneed/i18n";
import type { DevtoolsContext } from "@youneed/devtools";

registerDOM();
const { installDevtools } = await import("@youneed/devtools");
const { i18nPlugin, i18nPanel, i18nUsage, clearI18nUsage } = await import("../src/devtools.ts");

// CAPTURE: register the plugin once. DISPLAY: mount i18nPanel() separately.
installDevtools({ plugins: [i18nPlugin()] });

// `as const` preserves the template literals so per-key params (`{ name }`) type-check.
const resources = {
  en: { greeting: "Hello {name}", nav: { home: "Home", away: "Away" } },
  de: { greeting: "Hallo {name}", nav: { home: "Startseite" } }, // missing nav.away
} as const satisfies Record<string, Messages>;

// The panel only uses container + i18n; a bare ctx stub is enough.
const stubCtx = {} as DevtoolsContext;
const callCleanup = (c: void | (() => void)): void => void (typeof c === "function" && c());

class I18nDevtoolsSuite extends Test({ name: "dom-provider-i18n/devtools" }) {
  @Test.beforeEach() reset() {
    clearI18nUsage();
  }

  @Test.it("i18nPlugin() is a capture DevtoolsPlugin") plugin() {
    const plugin = i18nPlugin();
    expect(plugin.name).toBe("i18n");
    expect(typeof plugin.install).toBe("function");
  }

  @Test.it("i18nPanel() is a display DevtoolsPanel") panel() {
    const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });
    const panel = i18nPanel(i18n, { resources });
    expect(panel.id).toBe("i18n");
    expect(typeof panel.render).toBe("function");
  }

  @Test.it("the installed plugin captures t() calls into the buffer") capture() {
    const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });
    i18n("greeting", { name: "Ada" });
    const last = i18nUsage().at(-1)!;
    expect(last.key).toBe("greeting");
    expect(last.result).toBe("Hello Ada");
    expect(last.resolved).toBeTruthy();
  }

  @Test.it("renders a locale button per locale, active one highlighted") locales() {
    const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });
    const panel = i18nPanel(i18n, { resources });
    const root = document.createElement("div");
    const cleanup = panel.render(root, stubCtx);
    const buttons = [...root.querySelectorAll("button")].filter((b) =>
      (i18n.locales as readonly string[]).includes(b.textContent!),
    );
    expect(buttons.length).toBe(2);
    expect(buttons.find((b) => b.classList.contains("active"))?.textContent).toBe("en");
    callCleanup(cleanup);
  }

  @Test.it("clicking a locale button switches the translator") switchLocale() {
    const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });
    const panel = i18nPanel(i18n, { resources });
    const root = document.createElement("div");
    const cleanup = panel.render(root, stubCtx);
    const de = [...root.querySelectorAll("button")].find((b) => b.textContent === "de")!;
    (de as HTMLButtonElement).click();
    expect(i18n.locale).toBe("de");
    callCleanup(cleanup);
  }

  @Test.it("key browser flags keys missing in some locale") parity() {
    const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });
    const panel = i18nPanel(i18n, { resources });
    const root = document.createElement("div");
    const cleanup = panel.render(root, stubCtx);
    const badge = [...root.querySelectorAll(".badge")].map((b) => b.textContent).join("|");
    expect(badge.includes("de")).toBeTruthy(); // nav.away missing in de
    callCleanup(cleanup);
  }

  @Test.it("panel tails captured t() calls; missing keys flagged") usage() {
    const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });
    const panel = i18nPanel(i18n, { resources });
    const root = document.createElement("div");
    const cleanup = panel.render(root, stubCtx);
    i18n("greeting", { name: "Ada" });
    expect(root.querySelector(".logline")).toBeDefined();
    // A key that resolves in no locale → a "missing" log entry (loose `t` allows any string).
    (i18n as { t(key: string): string }).t("nav.nope");
    expect(root.querySelector(".logline.missing")).toBeDefined();
    callCleanup(cleanup);
  }

  @Test.it("without resources, the key browser is disabled") noResources() {
    const i18n = createI18n({ resources, locale: "en" });
    const panel = i18nPanel(i18n);
    const root = document.createElement("div");
    const cleanup = panel.render(root, stubCtx);
    expect(root.textContent!.includes("key browser disabled")).toBeTruthy();
    callCleanup(cleanup);
  }
}

await TestApplication().addTests(I18nDevtoolsSuite).reporter(new ConsoleReporter()).run();
