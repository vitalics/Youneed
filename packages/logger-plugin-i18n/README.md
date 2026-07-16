# @youneed/logger-plugin-i18n

Translate log messages through an [`@youneed/i18n`](../i18n) translator. Log
against stable message **keys** instead of hard-coded English, and let the plugin
render them — interpolating from the record's meta — before serialization.

```ts
import { createLogger, format } from "@youneed/logger";
import { createI18n } from "@youneed/i18n";
import { i18nPlugin } from "@youneed/logger-plugin-i18n";

const i18n = createI18n({
  resources: { en: { "server.started": "Listening on :{port}" } },
  locale: "en",
});

const log = createLogger({ format: format.combine(format.timestamp(), format.json()) });
log.use(i18nPlugin(i18n));

log.info("server.started", { port: 3000 }); // → message: "Listening on :3000"
```

A message that isn't a known key passes through verbatim, so plain-string logs
and keyed logs can coexist. The plugin follows the translator's active locale, so
switching with `i18n.setLocale("de")` re-localizes every subsequent line.

It's exposed two ways: `i18nFormat(i18n, opts)` (a `Format`, compose it yourself)
and `i18nPlugin(i18n, opts)` (prepends that format via `logger.useFormat`).

| option | default | meaning |
| --- | --- | --- |
| `paramsKey` | — | meta field holding interpolation params; otherwise the whole record feeds interpolation |
| `localeKey` | — | stamp the resolved locale onto the record under this key |
| `force` | `false` | translate even unknown keys (the translator's `missing` handler decides the output) |
