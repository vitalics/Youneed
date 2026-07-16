// @youneed/server-plugin-oauth2/facebook
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface FacebookOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["email", "public_profile"]`). */
  scopes?: string[];
  /** Graph API version (default `"v19.0"`). */
  apiVersion?: string;
  /** Use Authorization Code + PKCE (Facebook supports it). */
  pkce?: boolean;
}

/** A normalized Facebook profile. */
export interface FacebookProfile {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** Facebook OAuth provider — `import { facebook } from "@youneed/server-plugin-oauth2/facebook"`. */
export function facebook(opts: FacebookOptions): OAuthProvider<FacebookProfile> {
  const v = opts.apiVersion ?? "v19.0";
  return defineProvider<FacebookProfile>({
    name: "facebook",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `https://www.facebook.com/${v}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${v}/oauth/access_token`,
    userInfoUrl: `https://graph.facebook.com/${v}/me?fields=id,name,email,picture.type(large)`,
    scopes: opts.scopes ?? ["email", "public_profile"],
    pkce: opts.pkce,
    profile(raw) {
      const picture = raw.picture as { data?: { url?: string } } | undefined;
      return {
        id: String(raw.id),
        email: raw.email as string | undefined,
        name: raw.name as string | undefined,
        avatarUrl: picture?.data?.url,
        raw,
      };
    },
  });
}
