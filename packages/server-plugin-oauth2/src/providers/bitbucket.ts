// @youneed/server-plugin-oauth2/bitbucket
import { defineProvider, OAuthError, type OAuthProvider } from "../index.ts";

export interface BitbucketOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["account", "email"]`). */
  scopes?: string[];
  /** Also fetch the primary confirmed email from `/user/emails` (default true). */
  fetchEmail?: boolean;
}

/** A normalized Bitbucket profile. */
export interface BitbucketProfile {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

const BB = (token: string) => ({ authorization: `Bearer ${token}`, accept: "application/json" });

/** Bitbucket OAuth — `import { bitbucket } from "@youneed/server-plugin-oauth2/bitbucket"`. */
export function bitbucket(opts: BitbucketOptions): OAuthProvider<BitbucketProfile> {
  return defineProvider<BitbucketProfile>({
    name: "bitbucket",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://bitbucket.org/site/oauth2/authorize",
    tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
    userInfoUrl: "https://api.bitbucket.org/2.0/user",
    scopes: opts.scopes ?? ["account", "email"],
    // Bitbucket's /user has no email — it lives behind /user/emails.
    async fetchProfile(tokens, { fetch }) {
      const res = await fetch("https://api.bitbucket.org/2.0/user", { headers: BB(tokens.accessToken) });
      if (!res.ok) throw new OAuthError(`bitbucket user failed (${res.status})`);
      const user = (await res.json()) as Record<string, unknown>;
      if (opts.fetchEmail !== false) {
        const er = await fetch("https://api.bitbucket.org/2.0/user/emails", { headers: BB(tokens.accessToken) });
        if (er.ok) {
          const list = ((await er.json()) as { values?: Array<{ email: string; is_primary: boolean; is_confirmed: boolean }> }).values ?? [];
          user.email = (list.find((e) => e.is_primary && e.is_confirmed) ?? list.find((e) => e.is_confirmed))?.email;
        }
      }
      return user;
    },
    profile(raw) {
      const links = raw.links as { avatar?: { href?: string } } | undefined;
      return {
        id: String(raw.account_id ?? raw.uuid),
        email: raw.email as string | undefined,
        name: raw.display_name as string | undefined,
        username: raw.username as string | undefined,
        avatarUrl: links?.avatar?.href,
        raw,
      };
    },
  });
}
