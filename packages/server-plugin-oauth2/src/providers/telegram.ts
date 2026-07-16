// @youneed/server-plugin-oauth2/telegram
//
// Telegram is NOT OAuth2 — it's the Telegram Login Widget. The widget hands the
// browser a set of fields signed with HMAC-SHA256 using SHA256(botToken) as the
// key. You verify that signature; there's no authorize/token/redirect_uri flow,
// so this is a verifier + a route handler rather than an `OAuthProvider`.
//
//   import { telegramLogin } from "@youneed/server-plugin-oauth2/telegram";
//   app.get("/auth/telegram/callback", telegramLogin({
//     botToken: process.env.TG_BOT_TOKEN!,
//     onLogin: (ctx, user) => { ctx.cookies.set("uid", String(user.id), { httpOnly: true }); return redirect("/"); },
//   }));
//
// Point the Login Widget's `data-auth-url` at that route.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@youneed/server";
import type { Context } from "@youneed/server";

type MaybePromise<T> = T | Promise<T>;

/** The verified Telegram user (Login Widget payload). */
export interface TelegramUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
  raw: Record<string, string>;
}

/**
 * Verify a Telegram Login Widget payload. Returns the user if the HMAC signature
 * is valid (and, with `maxAgeSec`, fresh), else `null`. `data` is the widget's
 * fields (e.g. `ctx.query`): `id, first_name, …, auth_date, hash`.
 */
export function verifyTelegramLogin(
  botToken: string,
  data: Record<string, string | undefined>,
  opts: { maxAgeSec?: number } = {},
): TelegramUser | null {
  const hash = data.hash;
  if (!hash) return null;

  // data_check_string = "key=value" for every field except `hash`, sorted, "\n"-joined.
  const entries = Object.entries(data).filter(([k, v]) => k !== "hash" && v !== undefined) as [string, string][];
  const checkString = entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest();
  let given: Buffer;
  try {
    given = Buffer.from(hash, "hex");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(data.auth_date);
  if (opts.maxAgeSec !== undefined && authDate && Math.floor(Date.now() / 1000) - authDate > opts.maxAgeSec) return null;

  return {
    id: Number(data.id),
    firstName: data.first_name,
    lastName: data.last_name,
    username: data.username,
    photoUrl: data.photo_url,
    authDate,
    raw: data as Record<string, string>,
  };
}

export interface TelegramLoginOptions {
  /** The bot token from @BotFather. */
  botToken: string;
  /** Called with the verified user — create your session, return a result/redirect. */
  onLogin: (ctx: Context, user: TelegramUser) => MaybePromise<unknown>;
  /** Reject logins older than this many seconds (default 86400). */
  maxAgeSec?: number;
  /** Called on a failed/invalid login (default → 401). */
  onError?: (ctx: Context, error: unknown) => MaybePromise<unknown>;
}

/**
 * A route handler for the Telegram Login Widget. Verifies the signed query params,
 * then calls `onLogin` with the user. Mount it where the widget's `data-auth-url`
 * points (a `GET` route).
 */
export function telegramLogin(opts: TelegramLoginOptions): (ctx: Context) => MaybePromise<unknown> {
  const maxAgeSec = opts.maxAgeSec ?? 86_400;
  return (ctx) => {
    const user = verifyTelegramLogin(opts.botToken, ctx.query, { maxAgeSec });
    if (!user) {
      if (opts.onError) return opts.onError(ctx, new Error("invalid telegram login"));
      throw new HttpError(401, { error: "invalid_telegram_login" });
    }
    return opts.onLogin(ctx, user);
  };
}
