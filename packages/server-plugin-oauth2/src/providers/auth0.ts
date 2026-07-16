// @youneed/server-plugin-oauth2/auth0
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface Auth0Options {
  clientId: string;
  clientSecret: string;
  /** Auth0 tenant domain, e.g. `"acme.eu.auth0.com"` (or a custom domain). */
  domain: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** API audience — request an access token for your API (sets `audience`). */
  audience?: string;
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Auth0 profile. */
export interface Auth0Profile {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  raw: Record<string, unknown>;
}

const host = (d: string) => d.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Auth0 (OIDC) provider — `import { auth0 } from "@youneed/server-plugin-oauth2/auth0"`. */
export function auth0(opts: Auth0Options): OAuthProvider<Auth0Profile> {
  const d = host(opts.domain);
  return defineProvider<Auth0Profile>({
    name: "auth0",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `https://${d}/authorize`,
    tokenUrl: `https://${d}/oauth/token`,
    userInfoUrl: `https://${d}/userinfo`,
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    authorizeParams: opts.audience ? { audience: opts.audience } : undefined,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: raw.name as string | undefined,
        picture: raw.picture as string | undefined,
        raw,
      };
    },
  });
}
