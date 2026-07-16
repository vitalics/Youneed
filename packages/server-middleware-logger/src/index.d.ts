import type { Logger } from "@youneed/logger";
import type { Context, ControllerProvider, Middleware } from "@youneed/server";
export interface LoggerMiddlewareOptions {
    /** `ctx.state` key the child logger is stored under (default `"logger"`). */
    stateKey?: string;
    /** Extra bindings merged into the child logger (e.g. method / url). Per-request. */
    bindings?: (ctx: Context) => Record<string, unknown>;
}
/**
 * Access the request's child {@link Logger} — bound to `requestId` (+ `traceId`
 * when a trace span ran upstream). Returns a safe default logger when the
 * {@link logger} middleware isn't installed, so handlers can call it freely.
 */
export declare function log(ctx: Context): Logger;
/**
 * Attach a request-scoped child of `base` to every request, bound to the
 * correlation ids, exposed via {@link log}`(ctx)`. Register early so downstream
 * middleware and the handler all share the same contextual logger.
 */
export declare function logger(base: Logger, opts?: LoggerMiddlewareOptions): Middleware;
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
export declare function loggerProvider(base?: Logger, opts?: LoggerProviderOptions): ControllerProvider<{
    log: Logger;
}>;
