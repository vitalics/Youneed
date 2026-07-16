// ── @youneed/logger-plugin-exception — Winston-style exception handlers ──────
//
// Logs `uncaughtException` and `unhandledRejection`, then (like Winston, by
// default) flushes the logger and exits. Process handlers are Node-only, which
// is exactly why this is a plugin package rather than part of the universal
// core: `createLogger({ plugins: [exceptionHandler()] })` wires it in, and
// `logger.close()` detaches the handlers again (the plugin returns a disposable).

import type { Logger, LoggerPlugin } from "@youneed/logger";

export interface ExceptionPluginOptions {
  /** Level used for the logged record. Default `"error"`. */
  level?: string;
  /** Listen for `uncaughtException`. Default `true`. */
  handleExceptions?: boolean;
  /** Listen for `unhandledRejection`. Default `true`. */
  handleRejections?: boolean;
  /** Exit after logging (Winston's default). A predicate can decide per-error.
   *  Default `true`. */
  exitOnError?: boolean | ((err: unknown) => boolean);
  /** Exit code when exiting. Default `1`. */
  exitCode?: number;
  /** Max ms to wait for `logger.close()` to flush before forcing the exit. Default `3000`. */
  flushTimeout?: number;
}

/** Normalize a thrown value into a structured, JSON-friendly shape. */
function serializeError(err: unknown): Record<string, unknown> | string {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { name: err.name, message: err.message, stack: err.stack };
    if (err.cause !== undefined) out.cause = err.cause instanceof Error ? serializeError(err.cause) : err.cause;
    return out;
  }
  return err !== null && typeof err === "object" ? (err as Record<string, unknown>) : String(err);
}

/** Plugin: capture process-level errors into the logger (and optionally exit). */
export function exceptionHandler(opts: ExceptionPluginOptions = {}): LoggerPlugin {
  return {
    name: "exception",
    install(logger: Logger) {
      const level = opts.level ?? "error";
      const exitCode = opts.exitCode ?? 1;
      let exiting = false;

      const finalize = (): void => {
        if (exiting) return;
        exiting = true;
        // Best-effort flush, but never hang the crash path: a timer forces exit.
        const force = setTimeout(() => process.exit(exitCode), opts.flushTimeout ?? 3000);
        (force as { unref?: () => void }).unref?.();
        void logger.close().finally(() => {
          clearTimeout(force);
          process.exit(exitCode);
        });
      };

      const emit = (err: unknown, message: string, kind: "exception" | "rejection"): void => {
        logger.log(level, message, { [kind]: true, error: serializeError(err) });
        const exit = typeof opts.exitOnError === "function" ? opts.exitOnError(err) : opts.exitOnError !== false;
        if (exit) finalize();
      };

      const onException = (err: unknown): void => emit(err, "uncaughtException", "exception");
      const onRejection = (reason: unknown): void => emit(reason, "unhandledRejection", "rejection");

      if (opts.handleExceptions !== false) process.on("uncaughtException", onException);
      if (opts.handleRejections !== false) process.on("unhandledRejection", onRejection);

      return {
        [Symbol.dispose](): void {
          process.off("uncaughtException", onException);
          process.off("unhandledRejection", onRejection);
        },
      };
    },
  };
}
