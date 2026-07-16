// @youneed/server middleware — stateless CSRF guard via the double-submit cookie
// pattern. Issues a token cookie on safe requests and requires it echoed back on
// unsafe verbs (header or `body._csrf`). Register globally or scope it.
import { HttpError } from "@youneed/server";
import type { Middleware, CookieOptions } from "@youneed/server";
import { randomBytes } from "node:crypto";

export interface CsrfOptions {
  cookieName?: string; // default "csrf"
  headerName?: string; // default "x-csrf-token"
  /** Methods that must carry a matching token (default the unsafe verbs). */
  protectedMethods?: string[];
  /** Token generator (default 36 hex chars). */
  token?: () => string;
  /** Attributes for the CSRF cookie. NOT HttpOnly — the client must read it. */
  cookie?: CookieOptions;
}

/**
 * Stateless CSRF guard (double-submit cookie). Issues a token cookie on safe
 * requests; on unsafe verbs, requires the same token echoed in a header (or
 * `body._csrf` when used as scoped middleware, after body parsing).
 */
export function csrf(opts: CsrfOptions = {}): Middleware {
  const cookieName = opts.cookieName ?? "csrf";
  const headerName = (opts.headerName ?? "x-csrf-token").toLowerCase();
  const protectedMethods = new Set(
    (opts.protectedMethods ?? ["POST", "PUT", "PATCH", "DELETE"]).map((m) => m.toUpperCase()),
  );
  const gen = opts.token ?? (() => randomBytes(18).toString("hex"));
  return (ctx, next) => {
    const req = ctx.request;
    let token = ctx.cookies.get(cookieName);
    if (!token) {
      token = gen();
      ctx.cookies.set(cookieName, token, { sameSite: "Lax", path: "/", ...opts.cookie });
    }
    ctx.state.csrf = token; // expose to handlers (e.g. to embed in a form/page)
    if (protectedMethods.has((req.method ?? "GET").toUpperCase())) {
      const sent =
        (req.headers[headerName] as string | undefined) ??
        (ctx.body && typeof ctx.body === "object"
          ? (ctx.body as Record<string, unknown>)._csrf
          : undefined);
      if (!sent || sent !== token) {
        throw new HttpError(403, { error: "Invalid CSRF token" });
      }
    }
    return next();
  };
}
