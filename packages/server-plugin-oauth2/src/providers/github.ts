// @youneed/server-plugin-oauth2/github
import { defineProvider, OAuthError, type OAuthProvider } from "../index.ts";

export interface GithubOptions {
  clientId: string;
  clientSecret: string;
  /** OAuth scopes (default `["read:user", "user:email"]`). */
  scopes?: string[];
  /** Also fetch the primary verified email from `/user/emails` (default true). */
  fetchEmail?: boolean;
}

/** A normalized GitHub profile. */
export interface GithubProfile {
  id: string;
  login: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

const GH_HEADERS = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: "application/json",
  "user-agent": "youneed-oauth2",
});

/** GitHub OAuth provider — `import { github } from "@youneed/server-plugin-oauth2/github"`. */
export function github(opts: GithubOptions): OAuthProvider<GithubProfile> {
  return defineProvider<GithubProfile>({
    name: "github",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: opts.scopes ?? ["read:user", "user:email"],
    // Custom fetch — GitHub's primary email may live behind /user/emails.
    async fetchProfile(tokens, { fetch }) {
      const res = await fetch("https://api.github.com/user", { headers: GH_HEADERS(tokens.accessToken) });
      if (!res.ok) throw new OAuthError(`github userinfo failed (${res.status})`);
      const user = (await res.json()) as Record<string, unknown>;
      if (!user.email && opts.fetchEmail !== false) {
        const er = await fetch("https://api.github.com/user/emails", { headers: GH_HEADERS(tokens.accessToken) });
        if (er.ok) {
          const list = (await er.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
          user.email = (list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified))?.email;
        }
      }
      return user;
    },
    profile(raw) {
      return {
        id: String(raw.id),
        login: String(raw.login),
        email: (raw.email as string | null) ?? undefined,
        name: (raw.name as string | null) ?? undefined,
        avatarUrl: raw.avatar_url as string | undefined,
        raw,
      };
    },
  });
}
