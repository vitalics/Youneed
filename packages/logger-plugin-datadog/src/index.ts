// ── @youneed/logger-plugin-datadog — Datadog default-field enrichment ────────
//
// Stamps Datadog's standard reserved attributes (`ddsource`, `service`,
// `hostname`, `ddtags`) onto every record via the logger's default meta, so the
// pipeline (e.g. `format.json()`) emits Datadog-ready lines. Values fall back to
// the DD_* environment (unified service tagging). This is the canonical
// `defaultMeta` use-case for the plugin system.
//
// Universal: the environment is read through `globalThis.process` (feature-
// detected, no `node:` import), so it no-ops cleanly in the browser/edge where
// you'd pass `service`/`env` explicitly instead.

import type { Logger, LoggerPlugin } from "@youneed/logger";

export interface DatadogPluginOptions {
  /** `service` attribute. Falls back to `DD_SERVICE`. */
  service?: string;
  /** `env` tag (into `ddtags`). Falls back to `DD_ENV`. */
  env?: string;
  /** `version` tag (into `ddtags`). Falls back to `DD_VERSION`. */
  version?: string;
  /** `ddsource` attribute. Default `"nodejs"`. */
  source?: string;
  /** `hostname` attribute. Falls back to `DD_HOSTNAME`. */
  hostname?: string;
  /** Extra `ddtags`, as `{ key: value }` or pre-formatted `"key:value"` strings. */
  tags?: Record<string, string> | string[];
  /** Arbitrary extra default fields (override the computed Datadog ones). */
  meta?: Record<string, unknown>;
}

function readEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

/** Build the comma-separated `ddtags` string from env/version + extra tags. */
function buildTags(env: string | undefined, version: string | undefined, tags: DatadogPluginOptions["tags"]): string {
  const parts: string[] = [];
  if (env) parts.push(`env:${env}`);
  if (version) parts.push(`version:${version}`);
  if (Array.isArray(tags)) parts.push(...tags);
  else if (tags) for (const [k, v] of Object.entries(tags)) parts.push(`${k}:${v}`);
  return parts.join(",");
}

/** Plugin: enrich every record with Datadog-standard default fields. */
export function datadog(opts: DatadogPluginOptions = {}): LoggerPlugin {
  return {
    name: "datadog",
    install(logger: Logger) {
      const env = readEnv();
      const service = opts.service ?? env.DD_SERVICE;
      const hostname = opts.hostname ?? env.DD_HOSTNAME;
      const ddtags = buildTags(opts.env ?? env.DD_ENV, opts.version ?? env.DD_VERSION, opts.tags);

      const fields: Record<string, unknown> = { ddsource: opts.source ?? "nodejs" };
      if (service) fields.service = service;
      if (hostname) fields.hostname = hostname;
      if (ddtags) fields.ddtags = ddtags;
      Object.assign(fields, opts.meta); // explicit meta wins over computed fields

      logger.defaults(fields);
    },
  };
}
