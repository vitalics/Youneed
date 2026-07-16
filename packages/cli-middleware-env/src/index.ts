// @youneed/cli-middleware-env — typed, validated environment variables.
//
//   import { env, t } from "@youneed/cli-middleware-env";
//
//   class Serve extends Command({
//     name: "serve",
//     middleware: [env({ PORT: t.port().default(3000), NODE_ENV: t.enum(["dev", "prod"]) })],
//   }) {
//     execute() {
//       this.server.listen(this.env.PORT);   // this.env.PORT: number
//     }
//   }
//
// Wraps @youneed/schema's env engine: each `t.*()` coerces & validates a var,
// and `this.env` is the typed result. Parsing happens at install time (before
// execute) and throws an EnvError listing every problem at once — fail-fast, so
// a misconfigured environment never reaches command logic.

import { contribute, type CliMiddleware } from "@youneed/cli";
import { type EnvOf, type EnvSchema, type EnvSource, parseEnv } from "@youneed/schema";

/** Options for {@link env}. */
export interface EnvMiddlewareOptions {
  /** Where to read variables from. Defaults to `process.env`. */
  source?: EnvSource;
}

/**
 * Environment middleware. Adds a typed, validated `this.env` parsed from
 * `process.env` (or `options.source`) against the given `@youneed/schema`
 * spec. Throws `EnvError` at install time if any variable is missing or invalid.
 */
export function env<Sc extends EnvSchema>(
  schema: Sc,
  options: EnvMiddlewareOptions = {},
): CliMiddleware<{ readonly env: EnvOf<Sc> }> {
  return {
    name: "env",
    install(ctx) {
      const source =
        options.source ?? ((typeof process !== "undefined" ? process.env : {}) as EnvSource);
      const { values, issues } = parseEnv(source, schema);
      if (issues.length > 0) {
        const detail = issues.map((i) => `  ${i.key}: ${i.message}`).join("\n");
        throw new Error(`invalid environment:\n${detail}`);
      }
      contribute(ctx.command, "env", values);
    },
  };
}

// Re-export the schema builder so users need only one import.
export { t, type EnvOf, type EnvSchema, type EnvSource, type Infer } from "@youneed/schema";
