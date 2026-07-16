// @youneed/server-plugin-oauth2/spotify
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface SpotifyOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["user-read-email", "user-read-private"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Spotify profile. */
export interface SpotifyProfile {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** Spotify OAuth — `import { spotify } from "@youneed/server-plugin-oauth2/spotify"`. */
export function spotify(opts: SpotifyOptions): OAuthProvider<SpotifyProfile> {
  return defineProvider<SpotifyProfile>({
    name: "spotify",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    userInfoUrl: "https://api.spotify.com/v1/me",
    scopes: opts.scopes ?? ["user-read-email", "user-read-private"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      const images = raw.images as Array<{ url?: string }> | undefined;
      return {
        id: String(raw.id),
        email: raw.email as string | undefined,
        name: raw.display_name as string | undefined,
        avatarUrl: images?.[0]?.url,
        raw,
      };
    },
  });
}
