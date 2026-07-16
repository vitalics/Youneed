// @youneed/server-plugin-oauth2/twitch
import { defineProvider, OAuthError, type OAuthProvider } from "../index.ts";

export interface TwitchOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["user:read:email"]`). */
  scopes?: string[];
  /** PKCE (default false; Twitch supports it for public clients). */
  pkce?: boolean;
}

/** A normalized Twitch profile. */
export interface TwitchProfile {
  id: string;
  email?: string;
  name?: string;
  login?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** Twitch OAuth — `import { twitch } from "@youneed/server-plugin-oauth2/twitch"`. */
export function twitch(opts: TwitchOptions): OAuthProvider<TwitchProfile> {
  return defineProvider<TwitchProfile>({
    name: "twitch",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: opts.scopes ?? ["user:read:email"],
    pkce: opts.pkce,
    // Helix /users needs the Client-Id header alongside the bearer token.
    async fetchProfile(tokens, { fetch }) {
      const res = await fetch("https://api.twitch.tv/helix/users", {
        headers: { authorization: `Bearer ${tokens.accessToken}`, "client-id": opts.clientId, accept: "application/json" },
      });
      if (!res.ok) throw new OAuthError(`twitch users failed (${res.status})`);
      const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
      return json.data?.[0] ?? {};
    },
    profile(raw) {
      return {
        id: String(raw.id),
        email: raw.email as string | undefined,
        name: (raw.display_name ?? raw.login) as string | undefined,
        login: raw.login as string | undefined,
        avatarUrl: raw.profile_image_url as string | undefined,
        raw,
      };
    },
  });
}
