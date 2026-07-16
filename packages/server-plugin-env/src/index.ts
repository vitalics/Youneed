// @youneed/server-plugin-env — type-safe environment variables for the server.
//
// `defineEnvironmentVariables(source, { schema })` coerces + validates a raw string
// source (defaults to `process.env`) against a `@youneed/schema` `t` spec, failing
// fast at boot with every issue aggregated into one `EnvError`. The schema (the `t`
// builder) and validation engine come from `@youneed/schema`; this package adds the
// server defaults: `process.env` as the source, and an `environment()` ServerPlugin
// that surfaces a redacted view in `app.topology()` / devtools.
//
//   import { defineEnvironmentVariables, t } from "@youneed/server-plugin-env";
//
//   export const env = defineEnvironmentVariables(process.env, {
//     schema: {
//       PORT: t.port().default(3000),
//       DATABASE_URL: t.url().secret(),
//       NODE_ENV: t.enum(["development", "production", "test"] as const).default("development"),
//     },
//   });
//   //    ^ typed: { PORT: number; DATABASE_URL: string; NODE_ENV: "development" | ... }
//
//   // As a plugin (validates eagerly; exposes a REDACTED view to devtools):
//   app.plugin(environment({ schema: { PORT: t.port().default(3000) } }));
//
// Unlike the browser (@youneed/dom-provider-env), server env is private: `.secret()` fields
// are masked by `describeEnv` and the plugin's `inspect()`, never echoed in errors.

import { EnvError, describeEnv, parseEnv, type EnvOf, type EnvSchema, type EnvSource } from "@youneed/schema";
import type { ServerPlugin } from "@youneed/server";

// Re-export the builder + engine pieces so a server needs a single import.
export { t, EnvError, describeEnv } from "@youneed/schema";
export type { Schema, Infer, EnvSchema, EnvOf, EnvSource, EnvIssue } from "@youneed/schema";

export interface DefineEnvOptions<Sc extends EnvSchema> {
  /** The variable spec: a record of `t.*()` schemas. */
  schema: Sc;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Coerce + validate `source` (default `process.env`) against `schema`. Throws an
 *  aggregated {@link EnvError} on any missing/invalid variable — call it at module
 *  top level so the process fails fast at boot. Returns a frozen, typed object. */
export function defineEnvironmentVariables<Sc extends EnvSchema>(
  source: EnvSource | undefined,
  options: DefineEnvOptions<Sc>,
): EnvOf<Sc> {
  const { values, issues } = parseEnv(source ?? (process.env as EnvSource), options.schema);
  if (issues.length > 0) throw new EnvError(issues);
  return Object.freeze(values);
}

/** Options for the {@link environment} ServerPlugin. */
export interface EnvironmentPluginOptions<Sc extends EnvSchema> extends DefineEnvOptions<Sc> {
  /** Source of raw strings. Defaults to `process.env`. */
  source?: EnvSource;
  /** Plugin name in `app.topology()`. Defaults to `"env"`. */
  name?: string;
}

/** A {@link ServerPlugin} that validates the env eagerly (fail-fast at construction)
 *  and exposes the validated values plus a REDACTED `inspect()` for devtools. */
export type EnvironmentPlugin<Sc extends EnvSchema> = ServerPlugin & {
  /** The validated, frozen env. */
  readonly values: EnvOf<Sc>;
};

export function environment<Sc extends EnvSchema>(options: EnvironmentPluginOptions<Sc>): EnvironmentPlugin<Sc> {
  const values = defineEnvironmentVariables(options.source, { schema: options.schema });
  return {
    name: options.name ?? "env",
    values,
    inspect: () => describeEnv(values, options.schema),
  };
}
