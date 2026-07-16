// @youneed/server-plugin-oauth2/linkedin
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface LinkedInOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["openid", "profile", "email"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized LinkedIn profile. */
export interface LinkedInProfile {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  raw: Record<string, unknown>;
}

/** LinkedIn (Sign In with LinkedIn / OIDC) — `import { linkedin } from "@youneed/server-plugin-oauth2/linkedin"`. */
export function linkedin(opts: LinkedInOptions): OAuthProvider<LinkedInProfile> {
  return defineProvider<LinkedInProfile>({
    name: "linkedin",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scopes: opts.scopes ?? ["openid", "profile", "email"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: (raw.name ?? [raw.given_name, raw.family_name].filter(Boolean).join(" ")) as string | undefined,
        picture: raw.picture as string | undefined,
        raw,
      };
    },
  });
}
