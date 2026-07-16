// @youneed/server-plugin-oauth2/discord
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface DiscordOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["identify", "email"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Discord profile. */
export interface DiscordProfile {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** Discord OAuth — `import { discord } from "@youneed/server-plugin-oauth2/discord"`. */
export function discord(opts: DiscordOptions): OAuthProvider<DiscordProfile> {
  return defineProvider<DiscordProfile>({
    name: "discord",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: opts.scopes ?? ["identify", "email"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      const id = String(raw.id);
      const avatar = raw.avatar as string | null;
      return {
        id,
        email: raw.email as string | undefined,
        name: (raw.global_name ?? raw.username) as string | undefined,
        username: raw.username as string | undefined,
        avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : undefined,
        raw,
      };
    },
  });
}
