// @youneed/cli-plugin-error — pretty error output for @youneed/cli.
//
//   Application({ name: "ops", commands: [...], plugins: [errorReporter()] });
//
// Uses the `onError` lifecycle hook to format an exception thrown by a command:
// a red header, the message, an optional `hint`/`code` carried on the error, and
// a stack trace when debugging. Returning a string replaces the default
// `error: …` line. Throw a `CliError` (or any error with `.hint`/`.code`) for
// richer output.

import type { CliPlugin, CommandRunInfo } from "@youneed/cli";

const red = (s: string): string => `\x1b[31m${s}\x1b[39m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;

/** A richer error: `hint` and `code` are surfaced by {@link errorReporter}. */
export class CliError extends Error {
  /** A one-line suggestion shown under the message. */
  readonly hint?: string;
  /** A short machine code shown next to the header (e.g. `ENOENT`). */
  readonly code?: string;
  constructor(message: string, options: { hint?: string; code?: string; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.hint = options.hint;
    this.code = options.code;
  }
}

/** Options for {@link errorReporter}. */
export interface ErrorReporterOptions {
  /**
   * Show the stack trace. `true`/`false`, or `"auto"` (default) — shown when
   * `DEBUG`/`YOUNEED_DEBUG` is set in the environment.
   */
  stack?: boolean | "auto";
  /** Replace the whole formatter. Return the stderr string. */
  format?: (error: unknown, info: CommandRunInfo) => string;
}

interface ErrorLike {
  message?: unknown;
  stack?: unknown;
  hint?: unknown;
  code?: unknown;
}

function shouldShowStack(stack: boolean | "auto" | undefined): boolean {
  if (typeof stack === "boolean") return stack;
  const env = typeof process !== "undefined" ? process.env : {};
  return Boolean(env.DEBUG || env.YOUNEED_DEBUG);
}

/** Format an error into the default pretty block. */
function formatError(error: unknown, showStack: boolean): string {
  const e = (error ?? {}) as ErrorLike;
  const message = typeof e.message === "string" ? e.message : String(error);
  const code = typeof e.code === "string" ? ` ${dim("[" + e.code + "]")}` : "";
  const lines = [`${red(bold("✖"))} ${red(message)}${code}`];
  if (typeof e.hint === "string") lines.push(`  ${dim("hint:")} ${e.hint}`);
  if (showStack && typeof e.stack === "string") {
    // Skip the first stack line (it repeats the message).
    const frames = e.stack.split("\n").slice(1).join("\n");
    if (frames) lines.push(dim(frames));
  }
  return lines.join("\n");
}

/**
 * Error-reporting plugin. Formats command errors on stderr — red header, hint,
 * code, and (when debugging) a stack trace.
 */
export function errorReporter(options: ErrorReporterOptions = {}): CliPlugin {
  return {
    name: "error",
    onError(error, info) {
      if (options.format) return options.format(error, info);
      return formatError(error, shouldShowStack(options.stack));
    },
  };
}
