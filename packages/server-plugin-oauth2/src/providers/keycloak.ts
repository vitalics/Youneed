// @youneed/server-plugin-oauth2/keycloak
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface KeycloakOptions {
  clientId: string;
  clientSecret?: string;
  /** Keycloak base URL, e.g. `"https://kc.acme.dev"`. */
  baseUrl: string;
  /** Realm name. */
  realm: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Keycloak profile. */
export interface KeycloakProfile {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  raw: Record<string, unknown>;
}

/** Keycloak (OIDC) provider — `import { keycloak } from "@youneed/server-plugin-oauth2/keycloak"`. */
export function keycloak(opts: KeycloakOptions): OAuthProvider<KeycloakProfile> {
  const root = `${opts.baseUrl.replace(/\/$/, "")}/realms/${encodeURIComponent(opts.realm)}/protocol/openid-connect`;
  return defineProvider<KeycloakProfile>({
    name: "keycloak",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `${root}/auth`,
    tokenUrl: `${root}/token`,
    userInfoUrl: `${root}/userinfo`,
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: (raw.name ?? raw.preferred_username) as string | undefined,
        username: raw.preferred_username as string | undefined,
        raw,
      };
    },
  });
}
