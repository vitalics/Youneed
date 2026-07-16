// @youneed/server-plugin-oauth2/entra  (Microsoft Entra ID / Azure AD)
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface EntraOptions {
  clientId: string;
  clientSecret: string;
  /** Directory (tenant) ID, or `"common"` / `"organizations"` / `"consumers"`
   *  (default `"common"`). */
  tenant?: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Microsoft Entra profile. */
export interface EntraProfile {
  id: string;
  email?: string;
  name?: string;
  raw: Record<string, unknown>;
}

/** Microsoft Entra ID (Azure AD, OIDC) — `import { entra } from "@youneed/server-plugin-oauth2/entra"`. */
export function entra(opts: EntraOptions): OAuthProvider<EntraProfile> {
  const tenant = opts.tenant ?? "common";
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
  return defineProvider<EntraProfile>({
    name: "entra",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/token`,
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub ?? raw.oid),
        email: (raw.email ?? raw.preferred_username) as string | undefined,
        name: raw.name as string | undefined,
        raw,
      };
    },
  });
}
