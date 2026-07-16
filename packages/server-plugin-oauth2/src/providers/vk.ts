// @youneed/server-plugin-oauth2/vk
import { defineProvider, OAuthError, type OAuthProvider } from "../index.ts";

export interface VkOptions {
  clientId: string;
  clientSecret: string;
  /** Scopes (default `["email"]`). */
  scopes?: string[];
  /** VK API version for `users.get` (default `"5.131"`). */
  apiVersion?: string;
}

/** A normalized VK profile. */
export interface VkProfile {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/** VK (VKontakte) OAuth provider — `import { vk } from "@youneed/server-plugin-oauth2/vk"`.
 *  Note: VK returns the user's email in the TOKEN response (when `email` scope is
 *  granted), and the profile via `users.get`. */
export function vk(opts: VkOptions): OAuthProvider<VkProfile> {
  const v = opts.apiVersion ?? "5.131";
  return defineProvider<VkProfile>({
    name: "vk",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://oauth.vk.com/authorize",
    tokenUrl: "https://oauth.vk.com/access_token",
    scopes: opts.scopes ?? ["email"],
    async fetchProfile(tokens, { fetch }) {
      const userId = tokens.raw.user_id;
      const url =
        `https://api.vk.com/method/users.get?fields=photo_200,screen_name&v=${v}` +
        `&access_token=${encodeURIComponent(tokens.accessToken)}${userId ? `&user_ids=${userId}` : ""}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new OAuthError(`vk users.get failed (${res.status})`);
      const json = (await res.json()) as { response?: Array<Record<string, unknown>>; error?: { error_msg?: string } };
      if (json.error) throw new OAuthError(`vk error: ${json.error.error_msg ?? "unknown"}`);
      const u = json.response?.[0] ?? {};
      // email lives in the token response, the rest in users.get
      return { ...u, id: u.id ?? userId, email: tokens.raw.email };
    },
    profile(raw) {
      return {
        id: String(raw.id),
        email: raw.email as string | undefined,
        name: [raw.first_name, raw.last_name].filter(Boolean).join(" ") || undefined,
        avatarUrl: raw.photo_200 as string | undefined,
        raw,
      };
    },
  });
}
