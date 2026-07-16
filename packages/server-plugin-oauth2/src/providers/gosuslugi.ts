// @youneed/server-plugin-oauth2/gosuslugi
//
// Госуслуги / ЕСИА (ESIA) login. NOT standard OAuth2: the `client_secret` is a
// detached SIGNATURE (PKCS7/CMS — usually GOST via CryptoPro) over
// `scope + timestamp + clientId + state`, recomputed PER REQUEST; the user id
// (`oid`) comes from a signed `id_token`, and the profile from REST calls to
// `/rs/prns/{oid}`. So signing is pluggable — you supply `sign(text) => signature`
// (CryptoPro service, an HSM, …); the framework isn't tied to one signer.
//
//   import { gosuslugi } from "@youneed/server-plugin-oauth2/gosuslugi";
//   app.plugin(gosuslugi({
//     host: "https://esia.gosuslugi.ru",          // or the test stand
//     clientId: "MY_SYSTEM",
//     secret: process.env.STATE_SECRET!,          // signs the state cookie
//     sign: (text) => cryptoPro.sign(text),       // returns the detached signature (base64)
//     publicKey: esiaPublicKeyPem,                // verify the RS256 id_token (or use verifyIdToken)
//     onLogin: (ctx, { profile }) => { /* your session */ return redirect("/"); },
//   }));
//   // GET /auth/esia  +  /auth/esia/callback
//
// For full manual control use `EsiaClient` directly (authLink / exchangeCode / userInfo).

import { createHmac, timingSafeEqual, verify as cryptoVerify } from "node:crypto";
import { HttpError } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";
import { redirect, type FetchLike } from "../index.ts";

export type MaybePromise<T> = T | Promise<T>;

export interface EsiaTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

/** A normalized ЕСИА profile. */
export interface EsiaProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  trusted?: boolean;
  email: { value: string; verified: boolean } | null;
  raw: { main: Record<string, unknown>; contacts: Record<string, unknown> };
}

export interface EsiaClientOptions {
  /** ESIA host, e.g. `"https://esia.gosuslugi.ru"` or the test stand. */
  host: string;
  clientId: string;
  /** Scopes (default `["openid", "email", "fullname"]`). */
  scope?: string[];
  /** Produce the detached signature used as `client_secret` (CryptoPro/HSM/…). */
  sign: (text: string) => MaybePromise<string>;
  /** ESIA public key — verifies the RS256 `id_token` (test stand). */
  publicKey?: string | Buffer;
  /** Custom `id_token` verification (e.g. GOST) → returns the claims. */
  verifyIdToken?: (idToken: string) => MaybePromise<Record<string, unknown>>;
  /** `fetch` for the token/REST calls (default global; inject for tests). */
  fetch?: FetchLike;
  /** Clock (injectable; default `() => new Date()`). */
  now?: () => Date;
  /** State/nonce generator (default `crypto.randomUUID`). */
  uuid?: () => string;
}

/** An ЕСИА flow failure. */
export class EsiaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsiaError";
  }
}

// ESIA timestamp: "YYYY.MM.DD HH:mm:ss ±HHMM" (local time + offset).
function esiaTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const tz = `${sign}${p(Math.floor(abs / 60))}${p(abs % 60)}`;
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${tz}`;
}

/** Low-level ЕСИА client — build the auth link, exchange the code, read the profile. */
export class EsiaClient {
  readonly #host: string;
  readonly #clientId: string;
  readonly #scope: string;
  readonly #opts: EsiaClientOptions;
  readonly #fetch: FetchLike;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(opts: EsiaClientOptions) {
    this.#host = opts.host.replace(/\/$/, "");
    this.#clientId = opts.clientId;
    this.#scope = (opts.scope ?? ["openid", "email", "fullname"]).join(" ");
    this.#opts = opts;
    this.#fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.#now = opts.now ?? (() => new Date());
    this.#uuid = opts.uuid ?? (() => globalThis.crypto.randomUUID());
  }

  // Sign `scope + timestamp + clientId + state` and assemble the common params.
  async #signParams(base: Record<string, string>): Promise<{ params: Record<string, string>; state: string }> {
    const timestamp = esiaTimestamp(this.#now());
    const state = this.#uuid();
    const clientSecret = (await this.#opts.sign(`${this.#scope}${timestamp}${this.#clientId}${state}`)).replace(/\n/g, "");
    return {
      params: { ...base, timestamp, client_id: this.#clientId, scope: this.#scope, state, client_secret: clientSecret },
      state,
    };
  }

  /** Build the authorize redirect URL. Returns the `state` to persist for the callback. */
  async authLink(redirectUri: string): Promise<{ url: string; state: string }> {
    const { params, state } = await this.#signParams({ redirect_uri: redirectUri, response_type: "code", access_type: "offline" });
    return { url: `${this.#host}/aas/oauth2/ac?${new URLSearchParams(params)}`, state };
  }

  /** Exchange an authorization `code` for tokens. */
  async exchangeCode(code: string, redirectUri: string): Promise<EsiaTokens> {
    const { params } = await this.#signParams({ grant_type: "authorization_code", token_type: "Bearer", redirect_uri: redirectUri, code });
    const res = await this.#fetch(`${this.#host}/aas/oauth2/te?${new URLSearchParams(params)}`, { method: "POST" });
    if (!res.ok) throw new EsiaError(`token exchange failed (${res.status})`);
    const json = (await res.json()) as Record<string, string>;
    if (!json.id_token || !json.access_token) throw new EsiaError("token response missing id_token/access_token");
    return { idToken: json.id_token, accessToken: json.access_token, refreshToken: json.refresh_token };
  }

  /** Verify the `id_token` and return its claims. */
  async parseIdToken(idToken: string): Promise<Record<string, unknown>> {
    if (this.#opts.verifyIdToken) return this.#opts.verifyIdToken(idToken);
    if (!this.#opts.publicKey) throw new EsiaError("provide `publicKey` or `verifyIdToken` to verify the id_token");
    const [h, p, s] = idToken.split(".");
    if (!h || !p || !s) throw new EsiaError("malformed id_token");
    const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), this.#opts.publicKey, Buffer.from(s, "base64url"));
    if (!ok) throw new EsiaError("invalid id_token signature");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
    const aud = claims.aud;
    const audOk = Array.isArray(aud) ? aud.includes(this.#clientId) : aud === this.#clientId;
    if (!audOk) throw new EsiaError("id_token audience mismatch");
    return claims;
  }

  /** Extract the subject `oid` from verified id_token claims. */
  static oidOf(claims: Record<string, unknown>): string {
    const sbj = claims["urn:esia:sbj"] as { "urn:esia:sbj:oid"?: string | number } | undefined;
    const oid = sbj?.["urn:esia:sbj:oid"];
    if (oid === undefined) throw new EsiaError("id_token has no subject oid");
    return String(oid);
  }

  /** Fetch the user's main info + contacts and normalize them. */
  async userInfo(tokens: EsiaTokens): Promise<EsiaProfile> {
    const oid = EsiaClient.oidOf(await this.parseIdToken(tokens.idToken));
    const headers = { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" };
    const [mainRes, ctRes] = await Promise.all([
      this.#fetch(`${this.#host}/rs/prns/${oid}`, { headers }),
      this.#fetch(`${this.#host}/rs/prns/${oid}/ctts?embed=(elements)`, { headers }),
    ]);
    if (!mainRes.ok || !ctRes.ok) throw new EsiaError(`profile fetch failed (${mainRes.status}/${ctRes.status})`);
    const main = (await mainRes.json()) as Record<string, unknown>;
    const contacts = (await ctRes.json()) as { elements?: Array<{ type: string; value: string; vrfStu?: string }> };
    const emailEl = (contacts.elements ?? []).find((e) => e.type === "EML");
    return {
      id: oid,
      firstName: main.firstName as string | undefined,
      lastName: main.lastName as string | undefined,
      middleName: main.middleName as string | undefined,
      trusted: main.trusted as boolean | undefined,
      email: emailEl ? { value: String(emailEl.value).toLowerCase(), verified: emailEl.vrfStu === "VERIFIED" } : null,
      raw: { main, contacts },
    };
  }
}

export interface GosuslugiOptions extends EsiaClientOptions {
  /** Signs the short-lived state cookie. */
  secret: string;
  /** Called after a successful login. */
  onLogin: (ctx: Context, result: { tokens: EsiaTokens; profile: EsiaProfile }) => MaybePromise<unknown>;
  /** Called on failure (default → 401). */
  onError?: (ctx: Context, error: unknown) => MaybePromise<unknown>;
  /** Base path (default `"/auth"`). */
  basePath?: string;
  /** Override the route paths (`login`, `callback` — absolute). */
  routes?: { login?: string; callback?: string };
  /** Absolute origin for `redirect_uri` (default: derived from the request). */
  baseUrl?: string;
  /** State-cookie name / lifetime. */
  cookieName?: string;
  cookieMaxAge?: number;
}

const signCookie = (secret: string, value: string): string =>
  `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;

function unsignCookie(secret: string, signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot < 1) return null;
  const value = signed.slice(0, dot);
  const mac = Buffer.from(signed.slice(dot + 1));
  const expected = Buffer.from(createHmac("sha256", secret).update(value).digest("base64url"));
  return mac.length === expected.length && timingSafeEqual(mac, expected) ? value : null;
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
 * Госуслуги / ЕСИА login as a ServerPlugin. Mounts `GET {basePath}/esia` (start →
 * signed redirect to ЕСИА) and `/esia/callback` (exchange code, verify id_token,
 * read profile → `onLogin`). A signed http-only state cookie protects the flow.
 */
export function gosuslugi(opts: GosuslugiOptions): ServerPlugin {
  const client = new EsiaClient(opts);
  const basePath = (opts.basePath ?? "/auth").replace(/\/$/, "");
  const loginPath = opts.routes?.login ?? `${basePath}/esia`;
  const callbackPath = opts.routes?.callback ?? `${basePath}/esia/callback`;
  const cookieName = opts.cookieName ?? "esia_state";
  const maxAge = opts.cookieMaxAge ?? 600;
  const callbackUri = (ctx: Context) => `${origin(ctx, opts.baseUrl)}${callbackPath}`;

  return {
    name: "gosuslugi",
    setup(app) {
      app.get(loginPath, async (ctx) => {
        const { url, state } = await client.authLink(callbackUri(ctx));
        const secure = origin(ctx, opts.baseUrl).startsWith("https");
        ctx.cookies.set(cookieName, signCookie(opts.secret, state), { httpOnly: true, sameSite: "Lax", path: "/", maxAge, secure });
        return redirect(url);
      });

      app.get(callbackPath, async (ctx) => {
        try {
          const raw = ctx.cookies.get(cookieName);
          const stored = raw ? unsignCookie(opts.secret, raw) : null;
          ctx.cookies.delete(cookieName, { path: "/" });
          if (ctx.query.error) throw new EsiaError(`provider error: ${ctx.query.error}`);
          if (!stored || !ctx.query.state || ctx.query.state !== stored) throw new EsiaError("state mismatch");
          const code = ctx.query.code;
          if (!code) throw new EsiaError("missing authorization code");

          const tokens = await client.exchangeCode(code, callbackUri(ctx));
          const profile = await client.userInfo(tokens);
          return await opts.onLogin(ctx, { tokens, profile });
        } catch (e) {
          if (opts.onError) return opts.onError(ctx, e);
          throw new HttpError(401, { error: "esia_failed", reason: String(e instanceof Error ? e.message : e) });
        }
      });
    },
  };
}
