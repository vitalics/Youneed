# @youneed/i18n

A tiny, fully-typed translation core. Build a translator from a plain
`resources` object — the keys you pass to it are **type-checked and
autocompleted**, inferred as a union of dotted paths from your message tree, so a
typo or a key that exists in only one locale is a compile error.

```ts
import { createI18n } from "@youneed/i18n";

const i18n = createI18n({
  resources: {
    en: { greeting: "Hello {name}", nav: { home: "Home" } },
    de: { greeting: "Hallo {name}", nav: { home: "Startseite" } },
  },
  locale: "en",
  fallbackLocale: "en",
});

i18n("greeting", { name: "Ada" }); // "Hello Ada"  ← autocompletes "greeting" | "nav.home"
i18n.setLocale("de");
i18n("nav.home");                   // "Startseite"
```

The instance is **both callable** (`i18n(key, params)`) **and an object** with
`locale`, `locales`, `t`, `has`, `setLocale` and `subscribe`.

## Plurals

A message can be a set of **plural forms** instead of a string. Pass `count` and
the right form is chosen via the platform's `Intl.PluralRules` for the active
locale — so every CLDR category (`zero`/`one`/`two`/`few`/`many`/`other`) works
with **zero shipped data**. Only `other` is required.

```ts
const i18n = createI18n({
  resources: {
    en: { items: { one: "{count} item", other: "{count} items" } },
    ru: { items: { one: "{count} товар", few: "{count} товара", many: "{count} товаров", other: "{count} товара" } },
  },
  locale: "en",
});

i18n("items", { count: 1 });  // "1 item"
i18n("items", { count: 5 });  // "5 items"
i18n.setLocale("ru");
i18n("items", { count: 3 });  // "3 товара"  (few)
i18n("place", { count: 2, ordinal: true }); // ordinal rules with `ordinal: true`
```

`items` stays a single autocompleted key — the form object is a leaf, not a
nested branch. Without `count` it resolves to `other`.

| API | meaning |
| --- | --- |
| `i18n(key, params?)` / `i18n.t(...)` | translate `key` for the active locale, interpolating `{slots}` from `params` |
| `i18n.locale` | the active locale |
| `i18n.locales` | every locale in `resources` |
| `i18n.has(key)` | whether `key` resolves (active locale or fallback); narrows the type |
| `i18n.setLocale(locale)` | switch locale + notify subscribers (no-op for an unknown one) |
| `i18n.subscribe(fn)` | run `fn` on every locale change; returns an unsubscribe |

| option | default | meaning |
| --- | --- | --- |
| `resources` | — (required) | `{ [locale]: messageTree }` — keys inferred from the leaf paths |
| `locale` | — (required) | initial active locale |
| `fallbackLocale` | `locale` | locale consulted when a key is missing in the active one |
| `missing` | returns the key | called when a key resolves in no locale |

## Companion packages

- **[@youneed/dom-provider-i18n](../dom-provider-i18n)** — `i18n('key')` inside `@youneed/dom`
  `html` templates, with reactive re-render on locale change.
- **[@youneed/logger-plugin-i18n](../logger-plugin-i18n)** — translate log message
  keys as they flow through `@youneed/logger`.
- **[@youneed/server-middleware-accept-language](../server-middleware-accept-language)** —
  negotiate the request locale from the `Accept-Language` header.
- **[@youneed/test-plugin-i18n](../test-plugin-i18n)** — assert translation parity
  (no missing/extra keys, balanced interpolation) in `@youneed/test`.
