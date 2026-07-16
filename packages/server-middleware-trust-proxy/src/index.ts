// @youneed/server middleware — resolve the real client IP / protocol / host from
// `X-Forwarded-*` headers when the app sits behind a load balancer / reverse proxy
// / CDN, and expose the result via a `clientInfo(ctx)` accessor.
//
//   app.use(trustProxy({ hops: 1 }))
//      .get("/whoami", (ctx) => Response.json(clientInfo(ctx)));
//   // → { ip: "1.2.3.4", protocol: "https", host: "api.example.com" }
//
// Trusting `X-Forwarded-*` blindly is a spoofing vector: any client can set them.
// Only enable `trust` when a known proxy you control rewrites/appends these headers.
// `X-Forwarded-For` is a comma list "client, proxy1, proxy2" where each proxy
// *appends* the address it saw. The rightmost entries are added by your own trusted
// proxies, so with `hops` trusted proxies the genuine client is the entry `hops`
// positions from the RIGHT.
import type { Context, Middleware } from "@youneed/server";

export interface TrustProxyOptions {
  /** Trust the `X-Forwarded-*` headers at all (default `true`). When `false`, the
   *  forwarded headers are ignored and everything is derived from the socket. */
  trust?: boolean;
  /** Number of trusted proxy hops in front of the app (default `1`). Selects the
   *  `X-Forwarded-For` entry `hops` positions from the right as the client IP. */
  hops?: number;
}

/** The resolved client view of the request. */
export interface ClientInfo {
  /** The client IP — from `X-Forwarded-For` (honoring `hops`) when trusted, else
   *  the socket's `remoteAddress`. */
  ip: string;
  /** `http` / `https` — from `X-Forwarded-Proto` when trusted, else derived from
   *  whether the socket is TLS-encrypted. */
  protocol: string;
  /** The host — from `X-Forwarded-Host` when trusted, else the `Host` header. */
  host: string;
}

const STATE_KEY = "clientInfo";

/** First value of a possibly-repeated / comma-joined header. */
function first(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const head = raw.split(",")[0]?.trim();
  return head ? head : undefined;
}

/** Socket-derived (untrusted) view — the safe default. `encrypted` is only present
 *  on a TLS socket, so it's narrowed off the base `net.Socket` type. */
function fromSocket(ctx: Context): ClientInfo {
  const socket = ctx.request.socket as (typeof ctx.request.socket & { encrypted?: boolean }) | undefined;
  return {
    ip: socket?.remoteAddress ?? "",
    protocol: socket?.encrypted ? "https" : "http",
    host: first(ctx.request.headers["host"]) ?? "",
  };
}

/**
 * Access the resolved {@link ClientInfo} for the current request. Returns a
 * socket-derived default when the `trustProxy()` middleware isn't installed, so
 * handlers can call it safely.
 */
export function clientInfo(ctx: Context): ClientInfo {
  return (ctx.state[STATE_KEY] as ClientInfo | undefined) ?? fromSocket(ctx);
}

/**
 * Resolve the real client IP / protocol / host from `X-Forwarded-*` headers and
 * store it on `ctx.state` (exposed via {@link clientInfo}`(ctx)`). Register early.
 */
export function trustProxy(opts: TrustProxyOptions = {}): Middleware {
  const trust = opts.trust ?? true;
  const hops = opts.hops ?? 1;
  return async (ctx, next) => {
    const info = fromSocket(ctx);
    if (trust) {
      const headers = ctx.request.headers;

      const xff = headers["x-forwarded-for"];
      const list = (Array.isArray(xff) ? xff.join(",") : xff)
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list && list.length > 0) {
        // The rightmost `hops` entries are appended by our own trusted proxies; the
        // genuine client is the entry just before them, `hops` positions from the
        // rightmost (last) entry. Clamp to the leftmost entry if the list is short.
        const idx = list.length - 1 - hops;
        info.ip = list[idx >= 0 ? idx : 0]!;
      }

      const proto = first(headers["x-forwarded-proto"]);
      if (proto) info.protocol = proto;

      const host = first(headers["x-forwarded-host"]);
      if (host) info.host = host;
    }
    ctx.state[STATE_KEY] = info;
    return await next();
  };
}
