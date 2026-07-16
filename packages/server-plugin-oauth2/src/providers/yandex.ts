// @youneed/server-plugin-oauth2/yandex
import { defineProvider, OAuthError, type OAuthProvider } from "../index.ts";

export interface YandexOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["login:email", "login:info"]`). */
  scopes?: string[];
  /** Use Authorization Code + PKCE (Yandex supports it). */
  pkce?: boolean;
}

/** A normalized Yandex profile. */
export interface YandexProfile {
  id: string;
  email?: string;
  name?: string;
  login?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** Yandex OAuth provider — `import { yandex } from "@youneed/server-plugin-oauth2/yandex"`. */
export function yandex(opts: YandexOptions): OAuthProvider<YandexProfile> {
  return defineProvider<YandexProfile>({
    name: "yandex",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://oauth.yandex.ru/authorize",
    tokenUrl: "https://oauth.yandex.ru/token",
    scopes: opts.scopes ?? ["login:email", "login:info"],
    pkce: opts.pkce,
    // Yandex's userinfo uses the `OAuth <token>` scheme (not Bearer) → custom fetch.
    async fetchProfile(tokens, { fetch }) {
      const res = await fetch("https://login.yandex.ru/info?format=json", {
        headers: { authorization: `OAuth ${tokens.accessToken}`, accept: "application/json" },
      });
      if (!res.ok) throw new OAuthError(`yandex userinfo failed (${res.status})`);
      return res.json();
    },
    profile(raw) {
      const avatarId = raw.default_avatar_id as string | undefined;
      return {
        id: String(raw.id),
        email: (raw.default_email as string | undefined) ?? (raw.emails as string[] | undefined)?.[0],
        name: (raw.real_name ?? raw.display_name ?? raw.login) as string | undefined,
        login: raw.login as string | undefined,
        avatarUrl: avatarId ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200` : undefined,
        raw,
      };
    },
  });
}
