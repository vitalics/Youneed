// ── @youneed/server-middleware-jwt — JWT (JWS) authentication ────────────────
//
// Verifies a `Authorization: Bearer <jwt>` token's signature AND claims, then
// stashes the payload on `ctx.state` (like `bearer`, but it understands JWTs).
// Zero dependencies — signatures via `node:crypto`, JWKS via global `fetch`.
//
//   import { Application } from "@youneed/server";
//   import { jwt } from "@youneed/server-middleware-jwt";
//
//   // Symmetric (HS256):
//   app.use(jwt({ secret: process.env.JWT_SECRET, issuer: "auth.acme.dev", audience: "api" }));
//
//   // Asymmetric via JWKS (RS256/ES256 — rotates keys by `kid`, cached):
//   app.use(jwt({ jwks: "https://auth.acme.dev/.well-known/jwks.json", algorithms: ["RS256"] }));
//
// Handlers read the verified claims: `ctx.state.user` (the JWT payload).

import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify, constants, type KeyObject } from "node:crypto";
import { HttpError } from "@youneed/server";
import type { Context, Middleware } from "@youneed/server";

export type JwtAlgorithm =
  | "HS256" | "HS384" | "HS512"
  | "RS256" | "RS384" | "RS512"
  | "PS256" | "PS384" | "PS512"
  | "ES256" | "ES384" | "ES512";

/** A JSON Web Key (subset) from a JWKS document. */
export interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

export interface JwtOptions {
  /** HMAC secret (HS*) — string or Buffer. */
  secret?: string | Buffer;
  /** A public key (PEM/JWK/KeyObject) for RS/PS/ES with a single fixed key. */
  publicKey?: string | Buffer | KeyObject;
  /** A JWKS endpoint URL or an inline `{ keys }` set — keys resolved by `kid`. */
  jwks?: string | { keys: Jwk[] };
  /** Allowed algorithms (defense in depth — reject tokens using anything else).
   *  Defaults: `["HS256"]` with a secret, `["RS256"]` with a key/JWKS. */
  algorithms?: JwtAlgorithm[];
  /** Required `iss` claim (string or one-of). */
  issuer?: string | string[];
  /** Required `aud` claim (string or one-of; token `aud` may be a string or array). */
  audience?: string | string[];
  /** Required `sub` claim. */
  subject?: string;
  /** Clock skew allowance for exp/nbf, in seconds (default 0). */
  clockToleranceSec?: number;
  /** Allow requests without a token to pass through (claims stay unset). */
  optional?: boolean;
  /** Where to stash the verified payload on `ctx.state` (default "user"). */
  stateKey?: string;
  /** WWW-Authenticate realm on a 401 (default "api"). */
  realm?: string;
  /** JWKS cache TTL in ms (default 600000 = 10 min). */
  jwksTtlMs?: number;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

const DIGEST: Record<string, string> = {
  "256": "sha256",
  "384": "sha384",
  "512": "sha512",
};
const decode = (seg: string): Buffer => Buffer.from(seg, "base64url");
const json = <T>(seg: string): T => JSON.parse(decode(seg).toString("utf8")) as T;

// ── JWKS (fetch + cache key objects by kid) ──────────────────────────────────
const jwksCache = new Map<string, { keys: Jwk[]; exp: number }>();
const keyObjCache = new WeakMap<Jwk, KeyObject>();

async function jwksKeys(jwks: string | { keys: Jwk[] }, ttlMs: number): Promise<Jwk[]> {
  if (typeof jwks !== "string") return jwks.keys ?? [];
  const cached = jwksCache.get(jwks);
  if (cached && cached.exp > Date.now()) return cached.keys;
  const res = await fetch(jwks);
  if (!res.ok) throw new HttpError(500, { error: "JWKS fetch failed" });
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache.set(jwks, { keys, exp: Date.now() + ttlMs });
  return keys;
}

function jwkToKey(jwk: Jwk): KeyObject {
  let key = keyObjCache.get(jwk);
  if (!key) keyObjCache.set(jwk, (key = createPublicKey({ key: jwk as never, format: "jwk" })));
  return key;
}

// ── signature verification ───────────────────────────────────────────────────
function verifySignature(alg: JwtAlgorithm, signingInput: string, signature: Buffer, key: KeyObject | string | Buffer): boolean {
  const digest = DIGEST[alg.slice(2)];
  if (!digest) return false;
  const data = Buffer.from(signingInput);
  if (alg.startsWith("HS")) {
    const expected = createHmac(digest, key as string | Buffer).update(data).digest();
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  }
  if (alg.startsWith("PS")) {
    return cryptoVerify(digest, data, { key: key as KeyObject, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }, signature);
  }
  if (alg.startsWith("ES")) {
    return cryptoVerify(digest, data, { key: key as KeyObject, dsaEncoding: "ieee-p1363" }, signature);
  }
  // RS*
  return cryptoVerify(digest, data, key as KeyObject, signature);
}

// ── claims ────────────────────────────────────────────────────────────────────
function checkClaims(payload: Record<string, unknown>, opts: JwtOptions): string | undefined {
  const now = Math.floor(Date.now() / 1000);
  const tol = opts.clockToleranceSec ?? 0;
  if (typeof payload.exp === "number" && now >= payload.exp + tol) return "token expired";
  if (typeof payload.nbf === "number" && now < payload.nbf - tol) return "token not active yet";
  if (opts.issuer) {
    const allowed = Array.isArray(opts.issuer) ? opts.issuer : [opts.issuer];
    if (!allowed.includes(payload.iss as string)) return "issuer mismatch";
  }
  if (opts.audience) {
    const want = Array.isArray(opts.audience) ? opts.audience : [opts.audience];
    const have = Array.isArray(payload.aud) ? (payload.aud as string[]) : [payload.aud as string];
    if (!want.some((a) => have.includes(a))) return "audience mismatch";
  }
  if (opts.subject && payload.sub !== opts.subject) return "subject mismatch";
  return undefined;
}

/**
 * JWT auth middleware: verifies the `Authorization: Bearer <jwt>` signature
 * (HS/RS/PS/ES) and claims (exp, nbf, iss, aud, sub), then sets `ctx.state.user`
 * to the payload. Rejects with `401` (advertising a `WWW-Authenticate` challenge)
 * on a missing/invalid token, unless `optional`.
 */
export function jwt(opts: JwtOptions): Middleware {
  const stateKey = opts.stateKey ?? "user";
  const ttl = opts.jwksTtlMs ?? 600_000;
  const allowed = new Set<string>(opts.algorithms ?? (opts.secret ? ["HS256"] : ["RS256"]));
  const challenge = `Bearer realm="${opts.realm ?? "api"}"`;

  const reject = (ctx: Context, msg: string): never => {
    ctx.response.setHeader("WWW-Authenticate", `${challenge}, error="invalid_token", error_description="${msg}"`);
    throw new HttpError(401, { error: msg });
  };

  return async (ctx, next) => {
    const auth = ctx.request.headers["authorization"];
    const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
    if (!token) {
      if (opts.optional) return next();
      ctx.response.setHeader("WWW-Authenticate", challenge);
      throw new HttpError(401, { error: "Unauthorized" });
    }

    const parts = token.split(".");
    if (parts.length !== 3) return reject(ctx, "malformed token");
    const [h, p, s] = parts;

    let header: JwtHeader;
    let payload: Record<string, unknown>;
    try {
      header = json<JwtHeader>(h);
      payload = json<Record<string, unknown>>(p);
    } catch {
      return reject(ctx, "malformed token");
    }
    if (!allowed.has(header.alg)) return reject(ctx, `algorithm ${header.alg} not allowed`);

    // Resolve the key: HMAC → secret; asymmetric → fixed key or JWKS by kid.
    let key: KeyObject | string | Buffer;
    if (header.alg.startsWith("HS")) {
      if (!opts.secret) return reject(ctx, "no secret configured");
      key = opts.secret;
    } else if (opts.publicKey) {
      const pk = opts.publicKey;
      key = (pk as KeyObject).type === "public" ? (pk as KeyObject) : createPublicKey(pk as string | Buffer);
    } else if (opts.jwks) {
      const keys = await jwksKeys(opts.jwks, ttl);
      const jwk = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
      if (!jwk) return reject(ctx, "no matching key (kid)");
      key = jwkToKey(jwk);
    } else {
      return reject(ctx, "no key configured");
    }

    let ok = false;
    try {
      ok = verifySignature(header.alg as JwtAlgorithm, `${h}.${p}`, decode(s), key);
    } catch {
      ok = false;
    }
    if (!ok) return reject(ctx, "invalid signature");

    const claimError = checkClaims(payload, opts);
    if (claimError) return reject(ctx, claimError);

    ctx.state[stateKey] = payload;
    return next();
  };
}
