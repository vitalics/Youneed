// @youneed/server middleware — attach a REQUEST-SCOPED `@youneed/logger` child
// logger to each request, bound to the correlation ids (requestId + traceId), and
// expose it via `log(ctx)`. Every line a handler / downstream middleware emits
// through `log(ctx)` then automatically carries those ids — no manual threading.
//
//   const base = createLogger();
//   app.use(logger(base))
//      .get("/users", (ctx) => {
//        log(ctx).info("listing users", { count: 3 }); // → { ..., requestId, traceId? }
//        return Response.json([/* … */]);
//      });
//
// This COMPLEMENTS `@youneed/server-middleware-request-logger`, which emits one
// summary line per request (`METHOD url status ms`). That answers "what happened
// to this request?"; THIS answers "every line my code logged while handling it is
// stamped with the same ids", so a log search by `requestId` / `traceId` returns
// the summary line *and* every contextual line together.
import { createLogger } from "@youneed/logger";
import type { Logger } from "@youneed/logger";
import { context } from "@youneed/server";
import type { Context, ControllerProvider, Middleware } from "@youneed/server";

// The OpenTelemetry "invalid" trace id — emitted by a no-op/unsampled span. We
// skip it so the binding carries a real correlation id or nothing at all.
const ZERO_TRACE = "00000000000000000000000000000000";

export interface LoggerMiddlewareOptions {
  /** `ctx.state` key the child logger is stored under (default `"logger"`). */
  stateKey?: string;
  /** Extra bindings merged into the child logger (e.g. method / url). Per-request. */
  bindings?: (ctx: Context) => Record<string, unknown>;
}

const DEFAULT_STATE_KEY = "logger";

// Lazily-created fallback so `log(ctx)` never returns `undefined` when the
// middleware isn't installed — mirrors keep-alive's NOOP accessor pattern. It's a
// real (uncontextual) logger, so handlers can call it without guarding.
let fallback: Logger | undefined;
function fallbackLogger(): Logger {
  return (fallback ??= createLogger());
}

// Read the trace id structurally from `ctx.state.span` (set by an upstream trace
// middleware) — without depending on the trace package.
function traceIdOf(state: Record<string, unknown>): string | undefined {
  const span = state.span as { traceId?: string } | undefined;
  if (span?.traceId && span.traceId !== ZERO_TRACE) return span.traceId;
  return undefined;
}

/**
 * Access the request's child {@link Logger} — bound to `requestId` (+ `traceId`
 * when a trace span ran upstream). Returns a safe default logger when the
 * {@link logger} middleware isn't installed, so handlers can call it freely.
 */
export function log(ctx: Context): Logger {
  return (ctx.state[ctx.state.__loggerKey as string] as Logger | undefined) ?? fallbackLogger();
}

/**
 * Attach a request-scoped child of `base` to every request, bound to the
 * correlation ids, exposed via {@link log}`(ctx)`. Register early so downstream
 * middleware and the handler all share the same contextual logger.
 */
export function logger(base: Logger, opts: LoggerMiddlewareOptions = {}): Middleware {
  const stateKey = opts.stateKey ?? DEFAULT_STATE_KEY;
  return (ctx, next) => {
    const bindings: Record<string, unknown> = { requestId: ctx.requestId };
    const traceId = traceIdOf(ctx.state);
    if (traceId) bindings.traceId = traceId;
    if (opts.bindings) Object.assign(bindings, opts.bindings(ctx));
    ctx.state[stateKey] = base.child(bindings);
    // Record where we stored it so `log(ctx)` finds it under a custom stateKey.
    ctx.state.__loggerKey = stateKey;
    return next();
  };
}

/** Options for {@link loggerProvider}. */
export interface LoggerProviderOptions {
  /** Instance member the logger is exposed under (default `"log"`). */
  key?: string;
  /** `ctx.state` key the request-scoped child is read from (default `"logger"`). */
  stateKey?: string;
}

/**
 * A {@link ControllerProvider} that injects a {@link Logger} as `this.<key>`
 * (default `this.log`) onto a controller OR a `@youneed/server-plugin-jsonrpc`
 * endpoint — the provider form of {@link log}, for transports the HTTP middleware
 * can't reach (e.g. WebSocket JSON-RPC frames):
 *
 *   class Math extends JsonRPC({ providers: [loggerProvider(createLogger())] }) {
 *     @JsonRPC.method("sum", { args: [t.number(), t.number()] })
 *     sum(a: number, b: number) { this.log.info("sum", { a, b }); return a + b; }
 *   }
 *
 * Reading `this.log` returns the request-scoped child (when the {@link logger}
 * middleware ran for the current HTTP request) and otherwise the `base` logger —
 * so it works the same inside a POST handler and a WS frame. `base` defaults to a
 * fresh `createLogger()`.
 */
export function loggerProvider(base?: Logger, opts: LoggerProviderOptions = {}): ControllerProvider<{ log: Logger }> {
  const key = opts.key ?? "log";
  const logger = base ?? createLogger();
  return {
    install(instance: object) {
      Object.defineProperty(instance, key, {
        get() {
          const ctx = context();
          if (!ctx) return logger; // outside a request (WS frame, startup) → base
          const stateKey = (ctx.state.__loggerKey as string | undefined) ?? opts.stateKey ?? DEFAULT_STATE_KEY;
          return (ctx.state[stateKey] as Logger | undefined) ?? logger;
        },
        enumerable: false,
        configurable: true,
      });
    },
    __contributes: undefined as unknown as { log: Logger },
  };
}
