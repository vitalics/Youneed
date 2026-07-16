// @youneed/server-plugin-oauth2/slack
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface SlackOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Slack profile. */
export interface SlackProfile {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  teamId?: string;
  raw: Record<string, unknown>;
}

/** Sign in with Slack (OIDC) — `import { slack } from "@youneed/server-plugin-oauth2/slack"`. */
export function slack(opts: SlackOptions): OAuthProvider<SlackProfile> {
  return defineProvider<SlackProfile>({
    name: "slack",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://slack.com/openid/connect/authorize",
    tokenUrl: "https://slack.com/api/openid.connect.token",
    userInfoUrl: "https://slack.com/api/openid.connect.userInfo",
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: (raw.name ?? raw["https://slack.com/user_name"]) as string | undefined,
        picture: raw["https://slack.com/user_image_512"] as string | undefined,
        teamId: raw["https://slack.com/team_id"] as string | undefined,
        raw,
      };
    },
  });
}
