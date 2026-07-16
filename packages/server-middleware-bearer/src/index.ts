// @youneed/server middleware — Bearer-token authentication.
// Validates `Authorization: Bearer <token>`, resolves it to a principal via
// `verify`, and stashes the principal on `ctx.state`.
import { HttpError } from "@youneed/server";
import type { Middleware, Context } from "@youneed/server";
import type { MaybePromise } from "@youneed/core";

export interface BearerOptions {
  /** Resolve a token to a principal; return `false`/`null` to reject. */
  verify: (token: string, ctx: Context) => MaybePromise<unknown>;
  /** Allow requests without a token to pass through (principal stays unset). */
  optional?: boolean;
  /** WWW-Authenticate realm advertised on a 401. */
  realm?: string;
  /** Where to stash the principal on `ctx.state` (default "user"). */
  stateKey?: string;
}

/** Bearer-token auth: validates `Authorization: Bearer <token>`, sets ctx.state. */
export function bearer(opts: BearerOptions): Middleware {
  const stateKey = opts.stateKey ?? "user";
  const challenge = `Bearer realm="${opts.realm ?? "api"}"`;
  return async (ctx, next) => {
    const auth = ctx.request.headers["authorization"];
    const token =
      typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) {
      if (opts.optional) return next();
      ctx.response.setHeader("WWW-Authenticate", challenge);
      throw new HttpError(401, { error: "Unauthorized" });
    }
    const principal = await opts.verify(token, ctx);
    if (principal === false || principal == null) {
      if (opts.optional) return next();
      ctx.response.setHeader("WWW-Authenticate", challenge);
      throw new HttpError(401, { error: "Invalid token" });
    }
    ctx.state[stateKey] = principal;
    return next();
  };
}
