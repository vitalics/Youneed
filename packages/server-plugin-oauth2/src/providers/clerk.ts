// @youneed/server-plugin-oauth2/clerk
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface ClerkOptions {
  clientId: string;
  clientSecret: string;
  /** Clerk Frontend API domain, e.g. `"acme.clerk.accounts.dev"` (or custom). */
  domain: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Clerk profile. */
export interface ClerkProfile {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  raw: Record<string, unknown>;
}

const host = (d: string) => d.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Clerk (OIDC) provider — `import { clerk } from "@youneed/server-plugin-oauth2/clerk"`. */
export function clerk(opts: ClerkOptions): OAuthProvider<ClerkProfile> {
  const d = host(opts.domain);
  return defineProvider<ClerkProfile>({
    name: "clerk",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `https://${d}/oauth/authorize`,
    tokenUrl: `https://${d}/oauth/token`,
    userInfoUrl: `https://${d}/oauth/userinfo`,
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub ?? raw.user_id),
        email: (raw.email ?? raw.email_address) as string | undefined,
        name: (raw.name ?? [raw.given_name, raw.family_name].filter(Boolean).join(" ")) as string | undefined,
        picture: (raw.picture ?? raw.image_url) as string | undefined,
        raw,
      };
    },
  });
}
