// @youneed/server-plugin-oauth2/okta
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface OktaOptions {
  clientId: string;
  clientSecret: string;
  /** Okta org domain, e.g. `"dev-123.okta.com"` (or a custom domain). */
  domain: string;
  /** Custom authorization-server id (default: the org server, no id). */
  authServerId?: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Okta profile. */
export interface OktaProfile {
  id: string;
  email?: string;
  name?: string;
  raw: Record<string, unknown>;
}

const host = (d: string) => d.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Okta (OIDC) — `import { okta } from "@youneed/server-plugin-oauth2/okta"`. */
export function okta(opts: OktaOptions): OAuthProvider<OktaProfile> {
  const base = `https://${host(opts.domain)}/oauth2${opts.authServerId ? `/${opts.authServerId}` : ""}/v1`;
  return defineProvider<OktaProfile>({
    name: "okta",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/token`,
    userInfoUrl: `${base}/userinfo`,
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: (raw.name ?? raw.preferred_username) as string | undefined,
        raw,
      };
    },
  });
}
