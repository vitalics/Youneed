// @youneed/server middleware — force HTTPS and apply canonical redirects (host +
// trailing slash) in a single hop, before any handler runs.
//
//   app.use(httpsRedirect({ host: "example.com", trailingSlash: "never" }))
//      .get("/users", () => Response.json([/* … */]));
//   // http://www.example.com/users/  →  308  Location: https://example.com/users
//
// A request is "secure" when the socket is TLS-encrypted, OR (behind a proxy /
// load balancer, unless `trustProxy: false`) when `X-Forwarded-Proto: https`.
// When the request isn't secure — or the host / path isn't canonical — we emit a
// single redirect (default `308`, which preserves the method & body) to the
// canonical `https://<host><path>`. Otherwise we fall through to `next()`.
import type { Context, Middleware } from "@youneed/server";
import { Response } from "@youneed/server";

export interface HttpsRedirectOptions {
  /** Redirect status (default `308` — preserves method/body; use `301` for a
   *  permanent GET-style redirect). */
  status?: 301 | 308;
  /** Trust `X-Forwarded-Proto` / `X-Forwarded-Host` from an upstream proxy
   *  (default: on). Set `false` to only treat a directly-TLS socket as secure. */
  trustProxy?: boolean;
  /** Force a canonical host. If the request host differs (e.g. `www.x.com` vs
   *  `x.com`), the redirect points at this host. */
  host?: string;
  /** Normalize the path's trailing slash: `"always"` appends one, `"never"`
   *  strips it (the root `/` is always left intact). */
  trailingSlash?: "always" | "never";
}

/** A socket is secure when it's a TLS socket (`encrypted === true`). */
function socketSecure(ctx: Context): boolean {
  return (ctx.request.socket as { encrypted?: boolean } | undefined)?.encrypted === true;
}

/** First value of a possibly-comma-separated / array header, lowercased + trimmed. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim();
}

/** Normalize the trailing slash of a path (`pathname`, no query), keeping root `/`. */
function normalizeSlash(path: string, mode: "always" | "never" | undefined): string {
  if (!mode || path === "/") return path;
  if (mode === "never") return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
  // "always"
  return path.endsWith("/") ? path : path + "/";
}

/**
 * Force HTTPS and apply canonical host / trailing-slash redirects. Register early
 * (before routing) so it guards every request. When the request is already secure
 * and canonical it's a no-op (`next()`); otherwise it returns a single redirect.
 */
export function httpsRedirect(opts: HttpsRedirectOptions = {}): Middleware {
  const status = opts.status ?? 308;
  const trustProxy = opts.trustProxy !== false;
  return (ctx, next) => {
    const req = ctx.request;

    // Protocol: TLS socket, or trusted X-Forwarded-Proto: https.
    const secure =
      socketSecure(ctx) || (trustProxy && firstHeader(req.headers["x-forwarded-proto"]) === "https");

    // Host: prefer X-Forwarded-Host (when trusted), else Host.
    const reqHost =
      (trustProxy ? firstHeader(req.headers["x-forwarded-host"]) : undefined) ??
      firstHeader(req.headers["host"]);
    const host = opts.host ?? reqHost ?? "";

    // Split the request target into path + query, then normalize the path.
    const url = req.url ?? "/";
    const q = url.indexOf("?");
    const rawPath = q === -1 ? url : url.slice(0, q);
    const search = q === -1 ? "" : url.slice(q);
    const path = normalizeSlash(rawPath || "/", opts.trailingSlash);

    // A redirect is needed when anything isn't canonical.
    const hostMismatch = opts.host !== undefined && reqHost !== opts.host;
    const needsRedirect = !secure || hostMismatch || path !== rawPath;
    if (!needsRedirect) return next();

    const location = `https://${host}${path}${search}`;
    return Response({ status, headers: { Location: location } });
  };
}
