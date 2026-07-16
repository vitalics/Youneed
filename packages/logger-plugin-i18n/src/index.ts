// ── @youneed/logger-plugin-i18n — translate log messages via @youneed/i18n ───
//
// Log against stable message KEYS instead of hard-coded English, then render
// them through an `@youneed/i18n` translator at format time:
//
//   import { createLogger, format } from "@youneed/logger";
//   import { createI18n } from "@youneed/i18n";
//   import { i18nPlugin } from "@youneed/logger-plugin-i18n";
//
//   const i18n = createI18n({
//     resources: { en: { "server.started": "Listening on :{port}" } },
//     locale: "en",
//   });
//
//   const log = createLogger({ format: format.combine(format.timestamp(), format.json()) });
//   log.use(i18nPlugin(i18n));
//
//   log.info("server.started", { port: 3000 }); // → message: "Listening on :3000"
//
// Translating the message is a per-record transform, so the mechanism is a
// `Format` (`i18nFormat()`); the plugin (`i18nPlugin()`) just PREPENDS it via
// `logger.useFormat(...)` so the translated text is in place before a
// serializing format (`json`) renders. Interpolation params come from the
// record's meta (the `{ port }` you pass per call). A message that isn't a known
// key is left untouched — so mixing plain strings and keys is safe.

import type { Format, LoggerPlugin, TransformableInfo } from "@youneed/logger";
import type { I18n, TParams } from "@youneed/i18n";

export interface I18nLogOptions {
  /** Meta field holding interpolation params. When set, ONLY that field feeds
   *  interpolation; otherwise the whole record (minus `level`/`message`) does. */
  paramsKey?: string;
  /** Stamp the resolved locale onto the record under this key (e.g. `"locale"`).
   *  Off by default. */
  localeKey?: string;
  /** Translate even when `i18n.has(key)` is false (the translator's `missing`
   *  handler then decides the output). Default `false` — unknown messages pass
   *  through verbatim, so plain-string logs are unaffected. */
  force?: boolean;
}

/** Everything on a record except `level`/`message` — the interpolation params
 *  when no `paramsKey` is given. */
function metaParams(info: TransformableInfo): TParams {
  const out: TParams = {};
  for (const k of Object.keys(info)) {
    if (k === "level" || k === "message") continue;
    const v = info[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** A `Format` that replaces a known message key with its translation. Place it
 *  before a serializing format: `format.combine(i18nFormat(i18n), format.json())`. */
export function i18nFormat(i18n: I18n, opts: I18nLogOptions = {}): Format {
  return {
    transform(info: TransformableInfo): TransformableInfo {
      const key = info.message;
      if (typeof key === "string" && (opts.force || i18n.has(key))) {
        const params =
          opts.paramsKey !== undefined
            ? (info[opts.paramsKey] as TParams | undefined)
            : metaParams(info);
        info.message = i18n.t(key, params);
      }
      if (opts.localeKey) info[opts.localeKey] = i18n.locale;
      return info;
    },
  };
}

/** Plugin: prepend `i18nFormat(i18n)` so every record's message key is resolved
 *  before serialization. */
export function i18nPlugin(i18n: I18n, opts: I18nLogOptions = {}): LoggerPlugin {
  return { name: "i18n", install: (logger) => void logger.useFormat(i18nFormat(i18n, opts)) };
}
