# @youneed/cli-middleware-i18n

Translations for [`@youneed/cli`](../cli) commands, backed by
[`@youneed/i18n`](../i18n). Install the middleware and your command gains
**`this.i18n`** — a ready translator with `t(key, vars)` / `setLocale(locale)`.
Pass it an existing `I18n` instance or `createI18n` options (resources + default
locale); if the command declares a `--locale` option, the middleware switches the
active locale to the requested value **before** the command runs, so a single CLI
serves every locale from one message bundle.

```ts
import { Application, Command } from "@youneed/cli";
import { i18n } from "@youneed/cli-middleware-i18n";

const messages = {
  en: { hi: "Hello {name}", bye: "Goodbye" },
  ru: { hi: "Привет {name}", bye: "Пока" },
};

class Greet extends Command({
  name: "greet <name>",
  options: [{ name: "--locale <l>" }],
  middleware: [i18n({ resources: messages, locale: "en" })],
}) {
  execute(name: string) {
    console.log(this.i18n.t("hi", { name }));  // `greet Ada --locale ru` → "Привет Ada"
  }
}

Application({ name: "app", commands: [Greet] });
```

## `this.i18n`

A [`@youneed/i18n`](../i18n) instance:

- **`t(key, vars?)`** — translate `key` in the active locale, interpolating
  `{placeholder}` values from `vars`.
- **`setLocale(locale)`** — switch the active locale.

## Configuration

`i18n(source, options?)`:

- **`source`** — either a ready-made `I18n` instance (reused as-is) or
  `createI18n` options (`{ resources, locale }`) used to build a fresh one.
- **`options.localeOption`** — the option key holding the requested locale.
  Default `"locale"` (i.e. the command's `--locale` flag). When that option is a
  string at run time, `setLocale` is called with it.

## Exports

- **`i18n(source, options?)`** — the middleware factory. Contributes `this.i18n`.
- **`I18nMiddlewareOptions`** — `{ localeOption? }`.
- **`I18n`** — re-exported translator type.
