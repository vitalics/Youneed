// @youneed/server-plugin-oauth2/apple  (Sign in with Apple)
//
// Apple's `client_secret` is a SHORT-LIVED ES256 JWT you sign with your .p8 key
// (not a static string) — use `appleClientSecret(...)`. When you request the
// `name`/`email` scopes Apple uses `response_mode=form_post`, so the callback is a
// POST (the oauth2 plugin handles that); the state cookie must survive a
// cross-site POST → set `cookieSameSite: "None"` (over HTTPS). Apple has no
// userinfo endpoint — the profile comes from the `id_token`.
import { sign as cryptoSign } from "node:crypto";
import { defineProvider, type OAuthProvider, type MaybePromise } from "../index.ts";

const b64u = (b: Buffer | string): string => Buffer.from(b).toString("base64url");

export interface AppleClientSecretOptions {
  /** Apple Developer Team ID (`iss`). */
  teamId: string;
  /** The Services ID / client ID (`sub`). */
  clientId: string;
  /** The key ID of your .p8 signing key (`kid`). */
  keyId: string;
  /** The EC P-256 private key (.p8 PEM contents or a KeyObject). */
  privateKey: string | Buffer;
  /** Token lifetime in seconds (default 3600; Apple max is ~6 months). */
  expiresInSec?: number;
  /** Clock (injectable for tests). */
  now?: () => number;
}

/** Build Apple's `client_secret` generator — a signed ES256 JWT, minted per call. */
export function appleClientSecret(opts: AppleClientSecretOptions): () => string {
  const now = opts.now ?? (() => Date.now());
  return () => {
    const iat = Math.floor(now() / 1000);
    const header = b64u(JSON.stringify({ alg: "ES256", kid: opts.keyId, typ: "JWT" }));
    const payload = b64u(
      JSON.stringify({ iss: opts.teamId, iat, exp: iat + (opts.expiresInSec ?? 3600), aud: "https://appleid.apple.com", sub: opts.clientId }),
    );
    const sig = cryptoSign("sha256", Buffer.from(`${header}.${payload}`), { key: opts.privateKey, dsaEncoding: "ieee-p1363" });
    return `${header}.${payload}.${b64u(sig)}`;
  };
}

export interface AppleOptions {
  /** The Services ID (web) or App ID. */
  clientId: string;
  /** A static secret, or `appleClientSecret({...})` (recommended). */
  clientSecret: string | (() => MaybePromise<string>);
  /** Scopes (default `["name", "email"]`). With these, Apple POSTs the callback. */
  scopes?: string[];
  /** `response_mode` (default `"form_post"` when scopes are requested). */
  responseMode?: "query" | "form_post";
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Apple profile (from the `id_token`). */
export interface AppleProfile {
  id: string;
  email?: string;
  emailVerified?: boolean;
  raw: Record<string, unknown>;
}

// Apple has no userinfo endpoint — decode the id_token (delivered over a direct
// TLS token call, so it's trusted) for the claims.
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const p = jwt.split(".")[1];
  if (!p) return {};
  try {
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Sign in with Apple — `import { apple, appleClientSecret } from "@youneed/server-plugin-oauth2/apple"`. */
export function apple(opts: AppleOptions): OAuthProvider<AppleProfile> {
  const scopes = opts.scopes ?? ["name", "email"];
  const responseMode = opts.responseMode ?? (scopes.length ? "form_post" : "query");
  return defineProvider<AppleProfile>({
    name: "apple",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    scopes,
    scopeSeparator: " ",
    pkce: opts.pkce ?? true,
    authorizeParams: responseMode === "form_post" ? { response_mode: "form_post" } : undefined,
    // No userinfo endpoint — the profile is in the id_token.
    fetchProfile(tokens) {
      return decodeJwtPayload(tokens.idToken ?? "");
    },
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        emailVerified: raw.email_verified === true || raw.email_verified === "true",
        raw,
      };
    },
  });
}
