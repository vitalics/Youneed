// @youneed/cli-middleware-i18n — translations for @youneed/cli commands.
//
//   const messages = { en: { hi: "Hello {name}" }, ru: { hi: "Привет {name}" } };
//   class Greet extends Command("greet <name>", {
//     options: [{ name: "--locale <l>" }],
//     middleware: [i18n({ resources: messages, locale: "en" })],
//   }) {
//     execute(name: string) { console.log(this.i18n.t("hi", { name })); }
//   }
//
// `this.i18n` is a @youneed/i18n instance. Pass it ready-made or give it
// `createI18n` options. If the command declares a locale option (default
// `locale`), it switches the active locale before the command runs.

import { contribute, type CliMiddleware } from "@youneed/cli";
import { createI18n, type I18n, type I18nOptions, type Messages } from "@youneed/i18n";

/** Options for {@link i18n}. */
export interface I18nMiddlewareOptions {
  /** Option key holding the requested locale. Default `locale`. */
  localeOption?: string;
}

function isI18n(value: unknown): value is I18n {
  // `createI18n` returns a callable Translator, so accept functions too.
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as I18n).t === "function" &&
    typeof (value as I18n).setLocale === "function"
  );
}

/**
 * i18n middleware. Adds `this.i18n` — a ready instance or one built from
 * `createI18n` options. Honours a `--locale` option when present.
 */
export function i18n(
  source: I18n | I18nOptions<Record<string, Messages>>,
  options: I18nMiddlewareOptions = {},
): CliMiddleware<{ readonly i18n: I18n }> {
  return {
    name: "i18n",
    install(ctx) {
      const instance: I18n = isI18n(source) ? source : createI18n(source);
      const locale = ctx.options[options.localeOption ?? "locale"];
      if (typeof locale === "string") instance.setLocale(locale);
      contribute(ctx.command, "i18n", instance);
    },
  };
}

export type { I18n } from "@youneed/i18n";
