// ── @youneed/server-middleware-authorization — pluggable Authorization auth ──
//
// A generic `Authorization: <prefix> <token>` middleware whose verification is
// driven by ANY signing algorithm you plug in. Where `jwt` hard-codes HS/RS/PS/ES,
// this lets you bring your own `sign`/`verify`/`generatePair` — Ed25519, GOST
// Kuznyechik, a national crypto suite, an HSM, whatever — and issue + verify
// self-contained signed tokens with it.
//
//   import { sign, verify, generatePair } from "my-signing-algo";
//   import { authorization } from "@youneed/server-middleware-authorization";
//
//   const kuznyechik = { name: "Kuznyechik", sign, verify, generatePair };
//   const { publicKey, privateKey } = kuznyechik.generatePair();
//
//   // verify side (the server):
//   app.use(authorization({ prefix: "Bearer", algorithm: kuznyechik, key: publicKey }));
//
//   // issue side (your login route):
//   const tokens = createTokens({ algorithm: kuznyechik, privateKey, publicKey });
//   const token = await tokens.sign({ sub: "u1" }, { expiresInSec: 3600 });
//
// Or skip the token format entirely and provide your own `verify(token, ctx)`
// (opaque tokens, DB lookup, introspection) — same header handling either way.

import { createHmac, timingSafeEqual, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { HttpError } from "@youneed/server";
import type { Context, Middleware } from "@youneed/server";

type MaybePromise<T> = T | Promise<T>;

/** A pluggable signing algorithm. `key` is opaque to us — whatever your algorithm
 *  understands (a secret, a `KeyObject`, raw bytes, an HSM handle…). */
export interface SigningAlgorithm<PrivateKey = unknown, PublicKey = PrivateKey> {
  /** Display name (used in `WWW-Authenticate` hints and devtools). */
  name?: string;
  /** Produce a signature over `data` with the private/secret key. */
  sign(data: Uint8Array, key: PrivateKey): MaybePromise<Uint8Array>;
  /** Return whether `signature` over `data` is valid under the public/secret key. */
  verify(data: Uint8Array, signature: Uint8Array, key: PublicKey): MaybePromise<boolean>;
  /** Optionally generate a fresh key pair (symmetric algorithms may return the
   *  same value for both). */
  generatePair?(): MaybePromise<{ privateKey: PrivateKey; publicKey: PublicKey }>;
}

/** A token verifier: returns the principal (truthy) or throws/returns falsy to reject. */
export type Verify<Principal = unknown> = (token: string, ctx: Context) => MaybePromise<Principal | false | null | undefined>;

/** Resolve the verification key per-request — e.g. fetch it from a DB/cache by a
 *  `kid`/`iss` in the token's (not-yet-verified) `payload`. May be async. `ctx`
 *  is `undefined` when called from `createTokens().verify`. */
export type KeyResolver = (payload: Record<string, unknown>, ctx: Context | undefined) => MaybePromise<unknown>;

/** Claim constraints checked for algorithm-issued tokens. */
export interface ClaimChecks {
  issuer?: string | string[];
  audience?: string | string[];
  subject?: string;
  clockToleranceSec?: number;
}

export interface AuthorizationOptions<Principal = unknown> extends ClaimChecks {
  /** Authorization scheme prefix (default `"Bearer"`). Matched case-insensitively.
   *  Use `""` to treat the whole header value as the token (no scheme). */
  prefix?: string;
  /** Fully custom verifier — receives the raw token, returns the principal. */
  verify?: Verify<Principal>;
  /** A signing algorithm — builds a self-contained signed-token verifier. */
  algorithm?: SigningAlgorithm;
  /** Verification key passed to `algorithm.verify` (public/secret key). */
  key?: unknown;
  /** Resolve the verification key per-request (async OK) — e.g. look it up in a
   *  DB by a `kid` in the payload. Takes precedence over `key`. */
  resolveKey?: KeyResolver;
  /** Let tokenless requests through (claims stay unset). */
  optional?: boolean;
  /** Where to put the principal on `ctx.state` (default `"user"`). */
  stateKey?: string;
  /** `WWW-Authenticate` scheme label (default = `prefix`, or `"Bearer"`). */
  scheme?: string;
  /** `WWW-Authenticate` realm (default `"api"`). */
  realm?: string;
}

/** A verification/issuing failure with a client-safe message. */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const b64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url");
const fromB64url = (s: string): Buffer => Buffer.from(s, "base64url");

function checkClaims(payload: Record<string, unknown>, c: ClaimChecks): void {
  const now = Math.floor(Date.now() / 1000);
  const tol = c.clockToleranceSec ?? 0;
  if (typeof payload.exp === "number" && now >= payload.exp + tol) throw new AuthorizationError("token expired");
  if (typeof payload.nbf === "number" && now < payload.nbf - tol) throw new AuthorizationError("token not active yet");
  if (c.issuer) {
    const allowed = Array.isArray(c.issuer) ? c.issuer : [c.issuer];
    if (!allowed.includes(payload.iss as string)) throw new AuthorizationError("issuer mismatch");
  }
  if (c.audience) {
    const want = Array.isArray(c.audience) ? c.audience : [c.audience];
    const have = Array.isArray(payload.aud) ? (payload.aud as string[]) : [payload.aud as string];
    if (!want.some((a) => have.includes(a))) throw new AuthorizationError("audience mismatch");
  }
  if (c.subject && payload.sub !== c.subject) throw new AuthorizationError("subject mismatch");
}

// ── self-contained signed tokens: `base64url(payload).base64url(signature)` ───
// The signing input is the payload segment's bytes (like JWT signs `header.payload`).
function signedVerifier(algorithm: SigningAlgorithm, key: unknown, claims: ClaimChecks, resolveKey?: KeyResolver): Verify<Record<string, unknown>> {
  return async (token, ctx) => {
    const dot = token.lastIndexOf(".");
    if (dot < 1) throw new AuthorizationError("malformed token");
    const payloadB64 = token.slice(0, dot);
    const data = Buffer.from(payloadB64); // utf8 bytes of the encoded segment
    // Parse the payload up front (still UNVERIFIED) so a `resolveKey` can read a
    // `kid`/`iss` from it. It's only trusted after the signature check below.
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(fromB64url(payloadB64).toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new AuthorizationError("malformed payload");
    }
    let verifyKey = key;
    if (resolveKey) {
      verifyKey = await resolveKey(payload, ctx);
      if (verifyKey == null) throw new AuthorizationError("no verification key");
    }
    let ok = false;
    try {
      ok = await algorithm.verify(data, fromB64url(token.slice(dot + 1)), verifyKey);
    } catch {
      ok = false;
    }
    if (!ok) throw new AuthorizationError("invalid signature");
    checkClaims(payload, claims);
    return payload;
  };
}

export interface SignOptions {
  /** Set `exp` to now + this many seconds. */
  expiresInSec?: number;
  /** Set `nbf` to now + this many seconds (token not valid before then). */
  notBeforeSec?: number;
}

export interface Tokens<Payload extends Record<string, unknown> = Record<string, unknown>> {
  /** Issue a signed token for `payload` (adds `iat`, and `exp`/`nbf` if requested). */
  sign(payload: Payload, opts?: SignOptions): Promise<string>;
  /** Verify a token and return its payload, or throw `AuthorizationError`. */
  verify(token: string): Promise<Payload>;
}

/** Build a token issuer/verifier from a signing algorithm + key pair. The
 *  `verify` here matches `authorization({ verify })`. */
export function createTokens<Payload extends Record<string, unknown> = Record<string, unknown>>(opts: {
  algorithm: SigningAlgorithm;
  privateKey: unknown;
  publicKey?: unknown;
  /** Resolve the verification key per-token (async OK) — overrides `publicKey`. */
  resolveKey?: KeyResolver;
} & ClaimChecks): Tokens<Payload> {
  const { algorithm, privateKey, publicKey, resolveKey, ...claims } = opts;
  const verify = signedVerifier(algorithm, publicKey ?? privateKey, claims, resolveKey) as Verify<Payload>;
  // Stamp the configured iss/aud/sub on issued tokens too (a single configured
  // value is both issued and verified; arrays/`undefined` are verify-only).
  const issIss = typeof claims.issuer === "string" ? claims.issuer : undefined;
  const issAud = typeof claims.audience === "string" ? claims.audience : undefined;
  return {
    async sign(payload, o) {
      const now = Math.floor(Date.now() / 1000);
      const full: Record<string, unknown> = { iat: now };
      if (issIss !== undefined) full.iss = issIss;
      if (issAud !== undefined) full.aud = issAud;
      if (claims.subject !== undefined) full.sub = claims.subject;
      Object.assign(full, payload); // explicit payload wins over defaults
      if (o?.expiresInSec != null) full.exp = now + o.expiresInSec;
      if (o?.notBeforeSec != null) full.nbf = now + o.notBeforeSec;
      const payloadB64 = b64url(Buffer.from(JSON.stringify(full)));
      const sig = await algorithm.sign(Buffer.from(payloadB64), privateKey);
      return `${payloadB64}.${b64url(sig)}`;
    },
    async verify(token) {
      const p = await verify(token, undefined as never);
      if (!p) throw new AuthorizationError("invalid token");
      return p;
    },
  };
}

/**
 * Generic `Authorization` header auth. Plug in a signing `algorithm` (+ `key`)
 * for self-contained signed tokens, OR a custom `verify(token, ctx)` for opaque
 * tokens / DB lookups. Sets the principal on `ctx.state[stateKey]`; replies `401`
 * with a `WWW-Authenticate` challenge on failure (unless `optional`).
 */
export function authorization<Principal = unknown>(opts: AuthorizationOptions<Principal>): Middleware {
  const prefix = opts.prefix ?? "Bearer";
  const stateKey = opts.stateKey ?? "user";
  const { issuer, audience, subject, clockToleranceSec } = opts;
  const verify: Verify<Principal> =
    opts.verify ??
    (opts.algorithm
      ? (signedVerifier(opts.algorithm, opts.key, { issuer, audience, subject, clockToleranceSec }, opts.resolveKey) as Verify<Principal>)
      : (() => {
          throw new Error("authorization(): provide `verify`, or `algorithm` (+ `key`).");
        })());

  const scheme = opts.scheme ?? (prefix || "Bearer");
  const challenge = `${scheme} realm="${opts.realm ?? "api"}"`;
  const plen = prefix.length;
  const lower = prefix.toLowerCase();

  const extract = (header: string): string | undefined => {
    if (plen === 0) return header.trim() || undefined; // no scheme → whole value
    if (header.length > plen + 1 && header.slice(0, plen).toLowerCase() === lower && header[plen] === " ") {
      return header.slice(plen + 1).trim() || undefined;
    }
    return undefined;
  };

  return async (ctx, next) => {
    const h = ctx.request.headers["authorization"];
    const token = typeof h === "string" ? extract(h) : undefined;
    if (!token) {
      if (opts.optional) return next();
      ctx.response.setHeader("WWW-Authenticate", challenge);
      throw new HttpError(401, { error: "Unauthorized" });
    }

    let principal: Principal | false | null | undefined;
    try {
      principal = await verify(token, ctx);
    } catch (e) {
      const msg = e instanceof AuthorizationError ? e.message : "invalid token";
      ctx.response.setHeader("WWW-Authenticate", `${challenge}, error="invalid_token", error_description="${msg}"`);
      throw new HttpError(401, { error: msg });
    }
    if (principal === false || principal == null) {
      ctx.response.setHeader("WWW-Authenticate", `${challenge}, error="invalid_token"`);
      throw new HttpError(401, { error: "invalid token" });
    }

    ctx.state[stateKey] = principal;
    return next();
  };
}

// ── reference algorithms (Node `crypto`) — symmetric + asymmetric examples ────

/** HMAC over a shared secret (symmetric). `key` is ignored — the secret is bound
 *  here; pass the same `hmacAlgorithm(secret)` to both sign and verify. */
export function hmacAlgorithm(secret: string | Buffer, digest = "sha256"): SigningAlgorithm<unknown> {
  return {
    name: `HMAC-${digest}`,
    sign: (data) => createHmac(digest, secret).update(data).digest(),
    verify: (data, sig) => {
      const expected = createHmac(digest, secret).update(data).digest();
      return expected.length === sig.length && timingSafeEqual(expected, sig);
    },
  };
}

/** Ed25519 signatures (asymmetric) via `node:crypto`. Keys are `KeyObject`s;
 *  `generatePair()` mints a fresh pair. A template for plugging your own algo. */
export function ed25519Algorithm(): SigningAlgorithm<KeyObject> {
  return {
    name: "Ed25519",
    sign: (data, key) => cryptoSign(null, Buffer.from(data), key),
    verify: (data, sig, key) => cryptoVerify(null, Buffer.from(data), key, sig),
    generatePair: () => generateKeyPairSync("ed25519"),
  };
}
