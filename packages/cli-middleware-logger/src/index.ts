// @youneed/cli-middleware-logger — structured logging for @youneed/cli commands.
//
//   class Deploy extends Command({
//     name: "deploy <env>",
//     options: [{ name: "-v, --verbose" }, { name: "-q, --quiet" }],
//     middleware: [logger()],
//   }) {
//     execute(target: string) {
//       this.logger.info("deploying", { target });
//     }
//   }
//
// `this.logger` is a @youneed/logger instance. Its level is wired from the run's
// flags: `--verbose`/`-v` lowers it to `debug`, `--quiet`/`-q` raises it to
// `warn`, or an explicit `--log-level <lvl>` wins. Pass your own Logger or
// LoggerOptions to override the base; the command name is attached as child meta.

import { contribute, type CliMiddleware, type MiddlewareContext } from "@youneed/cli";
import { createLogger, type Logger, type LoggerOptions } from "@youneed/logger";

/** Options for {@link logger}. */
export interface LoggerMiddlewareOptions extends LoggerOptions {
  /** Option key holding a verbose toggle. Default `verbose`. */
  verboseKey?: string;
  /** Option key holding a quiet toggle. Default `quiet`. */
  quietKey?: string;
  /** Option key holding an explicit level string. Default `logLevel`. */
  levelKey?: string;
  /**
   * Whether to bind the command name as child meta under this key. Default
   * `command`; pass `false` to skip the child logger.
   */
  bindCommand?: string | false;
}

function isLogger(value: unknown): value is Logger {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Logger).info === "function" &&
    typeof (value as Logger).child === "function"
  );
}

/** Resolve the effective level from the run's options. */
function resolveLevel(opts: LoggerMiddlewareOptions, ctx: MiddlewareContext): string | undefined {
  const explicit = ctx.options[opts.levelKey ?? "logLevel"];
  if (typeof explicit === "string") return explicit;
  if (ctx.options[opts.verboseKey ?? "verbose"] === true) return "debug";
  if (ctx.options[opts.quietKey ?? "quiet"] === true) return "warn";
  return opts.level;
}

/**
 * Logger middleware. Adds `this.logger`, deriving the log level from
 * `--verbose`/`--quiet`/`--log-level` (when the command declares them).
 *
 * Pass an existing {@link Logger} to reuse it, or {@link LoggerMiddlewareOptions}
 * to configure a fresh one.
 */
export function logger(
  init: Logger | LoggerMiddlewareOptions = {},
): CliMiddleware<{ readonly logger: Logger }> {
  const base = isLogger(init) ? init : undefined;
  const opts: LoggerMiddlewareOptions = isLogger(init) ? {} : init;

  return {
    name: "logger",
    install(ctx) {
      // Only auto-dispose a logger we created — never one the caller owns.
      const created = base ? undefined : createLogger(opts);
      let log = base ?? created!;

      const level = resolveLevel(opts, ctx);
      if (level) log.level = level;

      const bind = opts.bindCommand ?? "command";
      if (bind !== false) {
        const word = ctx.program.name;
        log = log.child({ [bind]: word });
        if (level) log.level = level;
      }

      contribute(ctx.command, "logger", log);
      // Returning the created logger registers it for teardown — closing its
      // transports (it is Disposable & AsyncDisposable) once the command settles.
      return created;
    },
  };
}

export type { Logger } from "@youneed/logger";
