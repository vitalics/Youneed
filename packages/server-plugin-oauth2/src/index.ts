// ── @youneed/server-plugin-oauth2 — OAuth2 / OIDC login (Authorization Code + PKCE) ──
//
// The LOGIN half of auth (obtaining a user's identity from GitHub/Google/…),
// distinct from `jwt`/`authorization` which VERIFY a token on each request. They
// compose: oauth2 logs the user in → you mint your own session/JWT → those guard
// your API.
//
//   import { oauth2 } from "@youneed/server-plugin-oauth2";
//   import { github } from "@youneed/server-plugin-oauth2/github";
//   import { google } from "@youneed/server-plugin-oauth2/google";
//
//   app.plugin(oauth2({
//     secret: process.env.OAUTH_SECRET!,                 // signs the state cookie
//     providers: {
//       github: github({ clientId, clientSecret }),
//       google: google({ clientId, clientSecret }),
//     },
//     async onLogin(ctx, { provider, profile, tokens }) {
//       const user = await db.upsert(provider, profile);
//       ctx.cookies.set("uid", user.id, { httpOnly: true });
//       return redirect("/");
//     },
//   }));
//   // → GET /auth/github  (start) and  GET /auth/github/callback  (finish)
//
// Providers are universal — build your own with `defineProvider({...})`; the
// ready-made ones (`/github`, `/google`) are just that with endpoints filled in.

import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, Response } from "@youneed/server";
import type { Context, ServerPlugin, HttpResult } from "@youneed/server";

export type MaybePromise<T> = T | Promise<T>;

/** A minimal `fetch` — the real global satisfies it; injectable for tests. */
export type FetchLike = (
  input: string | URL,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/** Normalized tokens from the token endpoint. */
export interface OAuthTokens {
  accessToken: string;
  tokenType?: string;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  /** Absolute expiry (unix seconds), if the provider sent `expires_in`. */
  expiresAt?: number;
  raw: Record<string, unknown>;
}

/** Normalized user profile (override per provider via `profile`). */
export interface OAuthProfile {
  id: string;
  email?: string;
  name?: string;
  raw: unknown;
}

/** A provider definition — endpoints + credentials + how to read the profile.
 *  Everything the flow needs; build your own with {@link defineProvider}. */
export interface OAuthProvider<P = OAuthProfile> {
  name: string;
  clientId: string;
  /** Static secret, or a generator (`() => secret`, may be async) for providers
   *  whose `client_secret` is computed per request (e.g. Apple's signed ES256 JWT). */
  clientSecret?: string | (() => MaybePromise<string>);
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scopes?: string[];
  /** Scope joiner (default `" "`). */
  scopeSeparator?: string;
  /** Use Authorization Code + PKCE (S256). */
  pkce?: boolean;
  /** Extra params appended to the authorize URL (e.g. `access_type=offline`). */
  authorizeParams?: Record<string, string>;
  /** Custom userinfo fetch (e.g. GitHub also needs `/user/emails`). */
  fetchProfile?: (tokens: OAuthTokens, helpers: { fetch: FetchLike }) => MaybePromise<unknown>;
  /** Map the raw userinfo (+ tokens) into your normalized profile. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile?: (raw: any, tokens: OAuthTokens, ctx: Context) => MaybePromise<P>;
}

/** Identity helper — define a provider with full type-inference of its `profile`. */
export function defineProvider<P = OAuthProfile>(provider: OAuthProvider<P>): OAuthProvider<P> {
  return provider;
}

/** What `onLogin` receives after a successful exchange. */
export interface OAuthResult<P = OAuthProfile> {
  provider: string;
  tokens: OAuthTokens;
  profile: P;
}

export interface OAuth2Options {
  /** Secret that signs the short-lived state cookie (CSRF + PKCE binding). */
  secret: string;
  /** Providers keyed by the path segment (`/auth/<key>`). */
  providers: Record<string, OAuthProvider>;
  /** Base path for the mounted routes (default `"/auth"`). */
  basePath?: string;
  /** Override the per-provider route paths. Defaults derive from `basePath`:
   *  `login: (p) => "/auth/" + p`, `callback: (p) => "/auth/" + p + "/callback"`.
   *  The `callback` path is also used to build the `redirect_uri`. */
  routes?: {
    login?: (provider: string) => string;
    callback?: (provider: string) => string;
  };
  /** Absolute origin for `redirect_uri` (default: derived from the request). */
  baseUrl?: string;
  /** Called after a successful login — YOU decide what a session is. */
  onLogin: (ctx: Context, result: OAuthResult) => MaybePromise<unknown>;
  /** Called on any failure (default → 401). */
  onError?: (ctx: Context, error: unknown) => MaybePromise<unknown>;
  /** `fetch` for the token/userinfo calls (default global; inject for tests). */
  fetch?: FetchLike;
  /** State-cookie name (default `"oauth2_state"`). */
  cookieName?: string;
  /** State-cookie / flow lifetime in seconds (default 600). */
  cookieMaxAge?: number;
  /** State-cookie `SameSite` (default `"Lax"`). Set `"None"` (requires HTTPS) for
   *  providers that POST the callback cross-site, e.g. Apple `response_mode=form_post`. */
  cookieSameSite?: "Lax" | "Strict" | "None";
}

/** An OAuth flow failure with a client-safe message. */
export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

const b64u = (b: Buffer): string => b.toString("base64url");
const randB64 = (n: number): string => b64u(randomBytes(n));

/** A PKCE `code_verifier` + its S256 `code_challenge`. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randB64(32);
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** A 302 redirect result. */
export function redirect(url: string, status = 302): HttpResult {
  return Response({ status, headers: { Location: url } });
}

/** Build the provider authorize URL for the redirect that starts the flow. */
export function buildAuthorizeUrl(
  provider: OAuthProvider,
  args: { redirectUri: string; state: string; challenge?: string },
): string {
  const u = new URL(provider.authorizeUrl);
  const p = u.searchParams;
  p.set("response_type", "code");
  p.set("client_id", provider.clientId);
  p.set("redirect_uri", args.redirectUri);
  if (provider.scopes?.length) p.set("scope", provider.scopes.join(provider.scopeSeparator ?? " "));
  p.set("state", args.state);
  if (args.challenge) {
    p.set("code_challenge", args.challenge);
    p.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.authorizeParams ?? {})) p.set(k, v);
  return u.toString();
}

function normalizeTokens(json: Record<string, unknown>): OAuthTokens {
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  return {
    accessToken: String(json.access_token ?? ""),
    tokenType: json.token_type as string | undefined,
    refreshToken: json.refresh_token as string | undefined,
    idToken: json.id_token as string | undefined,
    scope: json.scope as string | undefined,
    expiresAt: expiresIn !== undefined ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
    raw: json,
  };
}

/** Exchange an authorization `code` (+ PKCE verifier) for tokens. */
export async function exchangeCode(
  provider: OAuthProvider,
  args: { code: string; redirectUri: string; verifier?: string; fetch: FetchLike },
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: provider.clientId,
  });
  const secret = typeof provider.clientSecret === "function" ? await provider.clientSecret() : provider.clientSecret;
  if (secret) body.set("client_secret", secret);
  if (args.verifier) body.set("code_verifier", args.verifier);

  const res = await args.fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) throw new OAuthError(`token exchange failed (${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  if (json.error) throw new OAuthError(`token error: ${String(json.error)}`);
  return normalizeTokens(json);
}

/** Fetch the raw userinfo for a provider (custom `fetchProfile` or `userInfoUrl`). */
export async function fetchProfile(provider: OAuthProvider, tokens: OAuthTokens, fetchImpl: FetchLike): Promise<unknown> {
  if (provider.fetchProfile) return provider.fetchProfile(tokens, { fetch: fetchImpl });
  if (!provider.userInfoUrl) return {};
  const res = await fetchImpl(provider.userInfoUrl, {
    headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json", "user-agent": "youneed-oauth2" },
  });
  if (!res.ok) throw new OAuthError(`userinfo failed (${res.status})`);
  return res.json();
}

const defaultProfile = (raw: Record<string, unknown>): OAuthProfile => ({
  id: String(raw.id ?? raw.sub ?? ""),
  email: raw.email as string | undefined,
  name: (raw.name ?? raw.login) as string | undefined,
  raw,
});

// ── signed state cookie (CSRF nonce + PKCE verifier, browser-bound) ───────────
interface StatePayload {
  state: string;
  verifier?: string;
  returnTo?: string;
}

function signState(secret: string, payload: StatePayload): string {
  const json = b64u(Buffer.from(JSON.stringify(payload)));
  const mac = b64u(createHmac("sha256", secret).update(json).digest());
  return `${json}.${mac}`;
}

function unsignState(secret: string, value: string): StatePayload | null {
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const json = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1));
  const expected = createHmac("sha256", secret).update(json).digest();
  const macBuf = Buffer.from(b64u(expected));
  if (mac.length !== macBuf.length || !timingSafeEqual(mac, macBuf)) return null;
  try {
    return JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
}

function origin(ctx: Context, baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/$/, "");
  const h = ctx.request.headers;
  const xfproto = (h["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const encrypted = (ctx.request.socket as { encrypted?: boolean } | undefined)?.encrypted;
  const proto = xfproto ?? (encrypted ? "https" : "http");
  const host = (h["x-forwarded-host"] as string | undefined) ?? h.host ?? "localhost";
  return `${proto}://${host}`;
}

/**
 * OAuth2 / OIDC login as a ServerPlugin. For each provider it mounts
 * `GET {basePath}/{key}` (start → redirect to the provider) and
 * `GET {basePath}/{key}/callback` (finish → exchange code, fetch profile, call
 * `onLogin`). PKCE + a signed, http-only state cookie protect the flow.
 */
export function oauth2(opts: OAuth2Options): ServerPlugin {
  const basePath = (opts.basePath ?? "/auth").replace(/\/$/, "");
  const cookieName = opts.cookieName ?? "oauth2_state";
  const maxAge = opts.cookieMaxAge ?? 600;
  const sameSite = opts.cookieSameSite ?? "Lax";
  const fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);

  const loginPath = opts.routes?.login ?? ((p: string) => `${basePath}/${p}`);
  const callbackPath = opts.routes?.callback ?? ((p: string) => `${basePath}/${p}/callback`);
  const callbackUri = (ctx: Context, key: string) => `${origin(ctx, opts.baseUrl)}${callbackPath(key)}`;

  const start = (key: string, provider: OAuthProvider) => (ctx: Context): HttpResult => {
    const state = randB64(16);
    let challenge: string | undefined;
    let verifier: string | undefined;
    if (provider.pkce) ({ verifier, challenge } = pkcePair());
    const cookie = signState(opts.secret, { state, verifier, returnTo: ctx.query.returnTo });
    const secure = sameSite === "None" || origin(ctx, opts.baseUrl).startsWith("https");
    ctx.cookies.set(cookieName, cookie, { httpOnly: true, sameSite, path: "/", maxAge, secure });
    return redirect(buildAuthorizeUrl(provider, { redirectUri: callbackUri(ctx, key), state, challenge }));
  };

  const finish = (key: string, provider: OAuthProvider) => async (ctx: Context): Promise<unknown> => {
    try {
      const raw = ctx.cookies.get(cookieName);
      const data = raw ? unsignState(opts.secret, raw) : null;
      ctx.cookies.delete(cookieName, { path: "/" });
      // Params come via the query (GET) or the form body (POST `response_mode=form_post`, e.g. Apple).
      const body = ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, string>) : {};
      const state = body.state ?? ctx.query.state;
      const code = body.code ?? ctx.query.code;
      const error = body.error ?? ctx.query.error;
      if (error) throw new OAuthError(`provider error: ${error}`);
      if (!data || !state || state !== data.state) throw new OAuthError("state mismatch");
      if (!code) throw new OAuthError("missing authorization code");

      const tokens = await exchangeCode(provider, { code, redirectUri: callbackUri(ctx, key), verifier: data.verifier, fetch: fetchImpl });
      const rawProfile = await fetchProfile(provider, tokens, fetchImpl);
      const profile = provider.profile
        ? await provider.profile(rawProfile, tokens, ctx)
        : defaultProfile(rawProfile as Record<string, unknown>);
      return await opts.onLogin(ctx, { provider: key, tokens, profile });
    } catch (e) {
      if (opts.onError) return opts.onError(ctx, e);
      throw new HttpError(401, { error: "oauth_failed", reason: String(e instanceof Error ? e.message : e) });
    }
  };

  return {
    name: "oauth2",
    setup(app) {
      for (const [key, provider] of Object.entries(opts.providers)) {
        app.get(loginPath(key), start(key, provider));
        const done = finish(key, provider);
        app.get(callbackPath(key), done);
        app.post(callbackPath(key), done); // `response_mode=form_post` (Apple) posts the callback
      }
    },
  };
}
