// @youneed/server-plugin-oauth2/gitlab
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface GitlabOptions {
  clientId: string;
  clientSecret: string;
  /** GitLab base URL for self-managed instances (default `"https://gitlab.com"`). */
  baseUrl?: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized GitLab profile. */
export interface GitlabProfile {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** GitLab (OIDC) — `import { gitlab } from "@youneed/server-plugin-oauth2/gitlab"`. */
export function gitlab(opts: GitlabOptions): OAuthProvider<GitlabProfile> {
  const base = (opts.baseUrl ?? "https://gitlab.com").replace(/\/$/, "");
  return defineProvider<GitlabProfile>({
    name: "gitlab",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `${base}/oauth/authorize`,
    tokenUrl: `${base}/oauth/token`,
    userInfoUrl: `${base}/oauth/userinfo`,
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: raw.name as string | undefined,
        username: (raw.nickname ?? raw.preferred_username) as string | undefined,
        avatarUrl: raw.picture as string | undefined,
        raw,
      };
    },
  });
}
