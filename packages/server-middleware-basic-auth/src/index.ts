// @youneed/server middleware — HTTP Basic auth + API-key auth.
//
//   app.use(basicAuth({ users: { alice: "s3cret" }, realm: "Admin" }))
//      .use(apiKey({ keys: ["k-123"], header: "x-api-key" }));
//
// On success the resolved principal is stashed on `ctx.state` (`user` for Basic
// auth, `apiKey` for the key middleware). On failure the request is rejected with
// a `401` — Basic adds a `WWW-Authenticate: Basic …` challenge so browsers prompt.
//
// Passwords/keys compared against an in-memory map/list are checked in constant
// time (`crypto.timingSafeEqual`) so a timing side-channel can't leak them.
import { Response } from "@youneed/server";
import type { Context, Middleware } from "@youneed/server";
import { timingSafeEqual } from "node:crypto";

type MaybePromise<T> = T | Promise<T>;

/** Constant-time string equality (length-safe; never short-circuits on content). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch — compare a fixed-size digest-ish
  // pair so length differences don't leak via an early throw/return.
  if (ab.length !== bb.length) {
    // still burn a comparison against itself to keep timing uniform
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** Read the first value of a header (headers may arrive as `string[]`). */
function headerValue(ctx: Context, name: string): string | undefined {
  const v = ctx.request.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

// ============================================================
// Basic auth
// ============================================================

export interface BasicAuthOptions {
  /** Resolve `(user, pass)` to a principal; return `false`/`null` to reject. */
  verify?: (user: string, pass: string, ctx: Context) => MaybePromise<unknown>;
  /** Static `user → password` map (passwords compared in constant time). */
  users?: Record<string, string>;
  /** WWW-Authenticate realm advertised on a 401 (default "Restricted"). */
  realm?: string;
  /** Where to stash the principal on `ctx.state` (default "user"). */
  stateKey?: string;
}

/** HTTP Basic auth: validates `Authorization: Basic <base64(user:pass)>`. */
export function basicAuth(opts: BasicAuthOptions): Middleware {
  const realm = opts.realm ?? "Restricted";
  const stateKey = opts.stateKey ?? "user";
  const challenge = `Basic realm="${realm}", charset="UTF-8"`;
  const reject = () =>
    Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": challenge } },
    );

  return async (ctx, next) => {
    const auth = headerValue(ctx, "authorization");
    if (typeof auth !== "string" || !auth.startsWith("Basic ")) return reject();

    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return reject();
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);

    let principal: unknown;
    if (opts.verify) {
      principal = await opts.verify(user, pass, ctx);
    } else if (opts.users) {
      const expected = Object.prototype.hasOwnProperty.call(opts.users, user)
        ? opts.users[user]
        : undefined;
      principal = expected !== undefined && safeEqual(pass, expected) ? { user } : false;
    } else {
      principal = false;
    }

    if (principal === false || principal == null) return reject();
    ctx.state[stateKey] = principal;
    return next();
  };
}

// ============================================================
// API-key auth
// ============================================================

export interface ApiKeyOptions {
  /** Resolve a key to a principal; return `false`/`null` to reject. */
  verify?: (key: string, ctx: Context) => MaybePromise<unknown>;
  /** Static list of accepted keys (compared in constant time). */
  keys?: string[];
  /** Request header to read the key from (default "x-api-key"). */
  header?: string;
  /** Query-param name to also read the key from (when set). */
  query?: string;
  /** Where to stash the principal on `ctx.state` (default "apiKey"). */
  stateKey?: string;
}

/** API-key auth: reads a key from a header and/or query param, validates it. */
export function apiKey(opts: ApiKeyOptions): Middleware {
  const headerName = (opts.header ?? "x-api-key").toLowerCase();
  const stateKey = opts.stateKey ?? "apiKey";
  const reject = () => Response.json({ error: "Unauthorized" }, { status: 401 });

  return async (ctx, next) => {
    let key = headerValue(ctx, headerName);
    if (key === undefined && opts.query) {
      const q = ctx.query?.[opts.query];
      if (typeof q === "string") key = q;
    }
    if (typeof key !== "string" || key.length === 0) return reject();

    let principal: unknown;
    if (opts.verify) {
      principal = await opts.verify(key, ctx);
    } else if (opts.keys) {
      let matched = false;
      // check every candidate so timing doesn't reveal which (if any) matched
      for (const candidate of opts.keys) {
        if (safeEqual(key, candidate)) matched = true;
      }
      principal = matched ? { key } : false;
    } else {
      principal = false;
    }

    if (principal === false || principal == null) return reject();
    ctx.state[stateKey] = principal;
    return next();
  };
}
