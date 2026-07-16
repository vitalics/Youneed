// @youneed/server middleware — advertise a `Keep-Alive` response header and give
// handlers programmatic control to drop the connection (e.g. on an abuse header).
//
//   app.use(keepAlive({ timeout: 10, max: 1000 }))
//      .use((ctx, next) => {
//        if (ctx.request.headers["x-malware"]) {
//          connection(ctx).destroy();     // tear the socket down NOW
//          throw new HttpError(403, { error: "blocked" });
//        }
//        return next();
//      });
//   // → Keep-Alive: timeout=10, max=1000   (omitted + `Connection: close` when dropped)
//
// `Keep-Alive` (MDN): `timeout=<seconds>, max=<requests>` — advisory hints for a
// persistent HTTP/1.1 connection. It's connection-specific, so it's skipped on
// HTTP/2 and HTTP/3 (where setting it would throw / be ignored). The advertised
// `timeout` is informational — Node's real idle timeout is `server.keepAliveTimeout`.
import type { Context, Middleware } from "@youneed/server";

export interface KeepAliveOptions {
  /** Seconds advertised as the idle keep-alive time (default `5`). Advisory: it
   *  tells the client; the actual socket idle timeout is `server.keepAliveTimeout`. */
  timeout?: number;
  /** Max requests advertised for this connection (omitted when unset). */
  max?: number;
  /** Gate the header per request (default: on). */
  enabled?: (ctx: Context) => boolean;
}

/** Programmatic control over the current connection. */
export interface Connection {
  /** Drop the connection AFTER this response completes: sends `Connection: close`
   *  and omits `Keep-Alive`, so the response is delivered, then the socket closes. */
  close(): void;
  /** Tear the socket down IMMEDIATELY (abrupt — for abuse/malware; the in-flight
   *  response is aborted). */
  destroy(): void;
  /** Whether `close()`/`destroy()` was requested. */
  readonly closing: boolean;
}

const STATE_KEY = "connection";
const NOOP: Connection = { close() {}, destroy() {}, closing: false };

/**
 * Access the per-request {@link Connection} controller. Returns a no-op when the
 * `keepAlive()` middleware isn't installed, so handlers can call it safely.
 */
export function connection(ctx: Context): Connection {
  return (ctx.state[STATE_KEY] as Connection | undefined) ?? NOOP;
}

/**
 * Advertise a `Keep-Alive` response header and expose {@link connection}`(ctx)` to
 * drop the connection programmatically. Register early so it sees every response.
 */
export function keepAlive(opts: KeepAliveOptions = {}): Middleware {
  const timeout = opts.timeout ?? 5;
  return async (ctx, next) => {
    let close = false;
    const ctrl: Connection = {
      get closing() {
        return close;
      },
      close() {
        close = true;
      },
      destroy() {
        close = true;
        ctx.request.socket?.destroy();
      },
    };
    ctx.state[STATE_KEY] = ctrl;
    try {
      return await next();
    } finally {
      const req = ctx.request;
      const res = ctx.response;
      // HTTP/2/3 forbid connection-specific headers; nothing to do if the socket
      // is gone or the response already went out.
      if (req.httpVersionMajor >= 2 || res.headersSent || res.writableEnded || req.socket?.destroyed) {
        // skip
      } else if (close) {
        res.setHeader("Connection", "close"); // deliver this response, then close
        res.removeHeader("Keep-Alive");
      } else if (opts.enabled ? opts.enabled(ctx) : true) {
        res.setHeader("Keep-Alive", opts.max !== undefined ? `timeout=${timeout}, max=${opts.max}` : `timeout=${timeout}`);
      }
    }
  };
}
