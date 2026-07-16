// @youneed/server-plugin-oauth2/google
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** Ask for a refresh token (`access_type=offline` + `prompt=consent`). */
  offline?: boolean;
}

/** A normalized Google profile. */
export interface GoogleProfile {
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  raw: Record<string, unknown>;
}

/** Google OAuth/OIDC provider — `import { google } from "@youneed/server-plugin-oauth2/google"`. */
export function google(opts: GoogleOptions): OAuthProvider<GoogleProfile> {
  return defineProvider<GoogleProfile>({
    name: "google",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: true,
    authorizeParams: opts.offline ? { access_type: "offline", prompt: "consent" } : undefined,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        emailVerified: raw.email_verified as boolean | undefined,
        name: raw.name as string | undefined,
        picture: raw.picture as string | undefined,
        raw,
      };
    },
  });
}
