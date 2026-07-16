// ── @youneed/server-middleware-api-key — shared-secret API key auth ──────────
//
// The simplest auth tier: the client presents a pre-issued secret key and we
// match it against a configured set (optionally mapped to a principal/scope).
// No structure, no signature, no expiry — "knows the secret ⇒ allowed". Best for
// service-to-service / integration callers. Always run it over TLS.
//
//   import { Application } from "@youneed/server";
//   import { apiKey } from "@youneed/server-middleware-api-key";
//
//   // A flat allowlist (key sent as `X-API-Key: <key>`):
//   app.use(apiKey({ keys: [process.env.PARTNER_KEY!] }));
//
//   // Keys mapped to a principal (identity + scopes on ctx.state.apiClient):
//   app.use(apiKey({ keys: { "k_live_abc": { name: "billing", scopes: ["read"] } } }));
//
//   // Store only HASHES of keys (never plaintext at rest):
//   app.use(apiKey({ hashed: true, keys: [sha256hex(process.env.PARTNER_KEY!)] }));
//
//   // Dynamic lookup (DB / cache):
//   app.use(apiKey({ verify: async (key) => db.clientByKey(key) }));
//
// Keys are matched by SHA-256 digest (preimage-resistant) → constant-time-safe
// without leaking length, and lets you store hashes instead of plaintext.

import { createHash } from "node:crypto";
import { HttpError } from "@youneed/server";
import type { Context, Middleware } from "@youneed/server";

type MaybePromise<T> = T | Promise<T>;

export interface ApiKeyOptions<Principal = unknown> {
  /** Valid keys — a flat allowlist, or a `key → principal` map. With `hashed:true`
   *  the entries (or the map keys) are SHA-256 hex digests, not raw keys. */
  keys?: string[] | Record<string, Principal> | Map<string, Principal>;
  /** Dynamic lookup — return the principal for a key, or falsy to reject. */
  verify?: (key: string, ctx: Context) => MaybePromise<Principal | false | null | undefined>;
  /** Header carrying the key (default `"x-api-key"`). */
  header?: string;
  /** Also accept the key from this query parameter (e.g. `"api_key"`). Off by default. */
  query?: string;
  /** Also accept `Authorization: <scheme> <key>` for this scheme (e.g. `"ApiKey"`). */
  scheme?: string;
  /** Entries in `keys` are SHA-256 hex digests of the real keys. */
  hashed?: boolean;
  /** Where to put the principal on `ctx.state` (default `"apiClient"`). */
  stateKey?: string;
  /** Let keyless requests through (principal stays unset). */
  optional?: boolean;
  /** Status for a rejected request (default `401`). */
  status?: number;
}

const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");

function buildLookup<Principal>(opts: ApiKeyOptions<Principal>): (key: string) => Principal | undefined {
  // Index by SHA-256 of the key → principal. Hashing the presented key then a
  // table lookup is constant-time-safe (no per-char compare against the secret).
  const table = new Map<string, Principal>();
  const add = (k: string, p: Principal) => table.set(opts.hashed ? k : sha256hex(k), p);
  const keys = opts.keys;
  if (Array.isArray(keys)) {
    for (const k of keys) add(k, { key: "***" } as Principal);
  } else if (keys instanceof Map) {
    for (const [k, p] of keys) add(k, p);
  } else if (keys) {
    for (const k of Object.keys(keys)) add(k, keys[k]);
  }
  return (key) => table.get(sha256hex(key));
}

function queryParam(ctx: Context, name: string): string | undefined {
  const url = ctx.request.url ?? "";
  const q = url.indexOf("?");
  if (q === -1) return undefined;
  return new URLSearchParams(url.slice(q + 1)).get(name) ?? undefined;
}

/**
 * API-key auth. Presents-the-key-wins: looks the key up against `keys` (matched
 * by SHA-256 digest) or a custom `verify`, then sets `ctx.state.apiClient`.
 * Reads the key from a header, optionally a query param or an `Authorization`
 * scheme. Rejects with `status` (default 401) when missing/invalid, unless `optional`.
 */
export function apiKey<Principal = unknown>(opts: ApiKeyOptions<Principal> = {}): Middleware {
  const headerName = (opts.header ?? "x-api-key").toLowerCase();
  const stateKey = opts.stateKey ?? "apiClient";
  const status = opts.status ?? 401;
  const lookup = opts.verify ? undefined : buildLookup(opts);
  const schemePrefix = opts.scheme ? `${opts.scheme.toLowerCase()} ` : undefined;

  const extract = (ctx: Context): string | undefined => {
    const h = ctx.request.headers[headerName];
    if (typeof h === "string" && h.trim()) return h.trim();
    if (schemePrefix) {
      const auth = ctx.request.headers["authorization"];
      if (typeof auth === "string" && auth.toLowerCase().startsWith(schemePrefix)) {
        const v = auth.slice(schemePrefix.length).trim();
        if (v) return v;
      }
    }
    if (opts.query) return queryParam(ctx, opts.query);
    return undefined;
  };

  const deny = (ctx: Context): never => {
    if (status === 401) ctx.response.setHeader("WWW-Authenticate", `${opts.scheme ?? "ApiKey"} realm="api"`);
    throw new HttpError(status, { error: status === 401 ? "Unauthorized" : "Forbidden" });
  };

  return async (ctx, next) => {
    const key = extract(ctx);
    if (!key) {
      if (opts.optional) return next();
      return deny(ctx);
    }
    const principal = opts.verify ? await opts.verify(key, ctx) : lookup!(key);
    if (principal === false || principal == null) {
      if (opts.optional) return next();
      return deny(ctx);
    }
    ctx.state[stateKey] = principal;
    return next();
  };
}
