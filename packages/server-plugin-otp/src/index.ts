// ── @youneed/server-plugin-otp — one-time-password login (SMS / email) ───────
//
// Passwordless / 2FA via a short code: the user requests an OTP for an identifier
// (phone or email), it's delivered over a channel, and they submit it to verify.
// A ServerPlugin (like oauth2): mounts POST `{basePath}/request` + `/verify`.
//
//   import { otp } from "@youneed/server-plugin-otp";
//   import { emailChannel } from "@youneed/server-plugin-otp/email";
//   import { smsChannel, twilioSms } from "@youneed/server-plugin-otp/sms";
//
//   app.plugin(otp({
//     secret: process.env.OTP_SECRET!,            // HMACs the stored code hash
//     channels: {
//       email: emailChannel({ host: "smtp.acme.dev", port: 587, auth: { user, pass }, from: "no-reply@acme.dev" }),
//       sms:   smsChannel({ send: twilioSms({ accountSid, authToken, from: "+1555…" }) }),
//     },
//     async onVerify(ctx, { channel, to }) {            // identity proven → your session
//       const user = await db.upsertByContact(channel, to);
//       ctx.cookies.set("uid", user.id, { httpOnly: true });
//       return { ok: true };
//     },
//   }));
//   // POST /otp/request { "channel": "email", "to": "a@b.dev" }
//   // POST /otp/verify  { "channel": "email", "to": "a@b.dev", "code": "123456" }
//
// The code is never returned in a response — only delivered via the channel. Only
// a salted HMAC of the code is stored; attempts are capped; codes expire.

import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";

export type MaybePromise<T> = T | Promise<T>;

/** A delivery channel — sends the generated `code` to a recipient. Build your own,
 *  or use `emailChannel` / `smsChannel` from the subpaths. */
export interface OtpChannel {
  name: string;
  send(to: string, code: string, ctx: Context): MaybePromise<void>;
}

/** One stored OTP challenge (only a hash of the code is kept). */
export interface OtpRecord {
  hash: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

/** Pluggable storage (default in-memory). A KV-backed impl scales across instances. */
export interface OtpStore {
  set(key: string, record: OtpRecord, ttlSec: number): MaybePromise<void>;
  get(key: string): MaybePromise<OtpRecord | undefined>;
  delete(key: string): MaybePromise<void>;
}

/** In-memory store — fine for a single instance / dev. */
export class MemoryOtpStore implements OtpStore {
  #m = new Map<string, OtpRecord>();
  set(key: string, record: OtpRecord) {
    this.#m.set(key, record);
  }
  get(key: string) {
    return this.#m.get(key);
  }
  delete(key: string) {
    this.#m.delete(key);
  }
}

export interface OtpOptions {
  /** Secret that HMACs the stored code hash. */
  secret: string;
  /** Delivery channels keyed by name (the request body picks one). */
  channels: Record<string, OtpChannel>;
  /** Called once a code verifies — YOU decide what a session is. */
  onVerify: (ctx: Context, info: { channel: string; to: string }) => MaybePromise<unknown>;
  /** Base path for the mounted routes (default `"/otp"`). */
  basePath?: string;
  /** Override the mounted route paths (absolute). Defaults derive from `basePath`:
   *  `{ request: "/otp/request", verify: "/otp/verify" }`. For a totally custom
   *  routing (different method, a Controller, …) use {@link otpHandlers} instead. */
  routes?: { request?: string; verify?: string };
  /** Code length in digits (default 6). */
  codeLength?: number;
  /** Code lifetime in seconds (default 300). */
  ttlSec?: number;
  /** Max verify attempts before the challenge is burned (default 5). */
  maxAttempts?: number;
  /** Min seconds between sends to the same recipient (default 60). */
  resendCooldownSec?: number;
  /** Storage (default `MemoryOtpStore`). */
  store?: OtpStore;
  /** Override code generation (e.g. alphanumeric). */
  generateCode?: () => string;
  /** Clock (injectable for tests; default `Date.now`). */
  now?: () => number;
}

const numericCode = (length: number): string => {
  let s = "";
  for (let i = 0; i < length; i++) s += randomInt(0, 10);
  return s;
};

const hashCode = (secret: string, channel: string, to: string, code: string): string =>
  createHmac("sha256", secret).update(`${channel}:${to}:${code}`).digest("hex");

const constantEq = (a: string, b: string): boolean => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The two request/verify handlers, decoupled from routing. */
export interface OtpHandlers {
  request: (ctx: Context) => Promise<unknown>;
  verify: (ctx: Context) => Promise<unknown>;
}

/**
 * Build the OTP `request`/`verify` handlers WITHOUT mounting any routes — for when
 * you want full control of the routing (a different method, a `Controller`, extra
 * guards…). `otp()` is the convenience that mounts these for you.
 *
 *   const { request, verify } = otpHandlers({ secret, channels, onVerify });
 *   app.post("/login/start", request).post("/login/finish", verify);
 */
export function otpHandlers(opts: OtpOptions): OtpHandlers {
  const codeLength = opts.codeLength ?? 6;
  const ttlSec = opts.ttlSec ?? 300;
  const maxAttempts = opts.maxAttempts ?? 5;
  const cooldownMs = (opts.resendCooldownSec ?? 60) * 1000;
  const store = opts.store ?? new MemoryOtpStore();
  const gen = opts.generateCode ?? (() => numericCode(codeLength));
  const now = opts.now ?? (() => Date.now());

  const key = (channel: string, to: string) => `${channel}:${to}`;

  const request = async (ctx: Context): Promise<unknown> => {
    const body = (ctx.body ?? {}) as { channel?: string; to?: string };
    const channelName = body.channel;
    const to = body.to;
    const channel = channelName ? opts.channels[channelName] : undefined;
    if (!channel || typeof to !== "string" || !to) throw new HttpError(400, { error: "channel and to are required" });

    const k = key(channelName!, to);
    const existing = await store.get(k);
    const t = now();
    if (existing && existing.expiresAt > t && t - existing.sentAt < cooldownMs) {
      const retryAfter = Math.ceil((cooldownMs - (t - existing.sentAt)) / 1000);
      ctx.response.setHeader("Retry-After", String(retryAfter));
      throw new HttpError(429, { error: "code already sent", retryAfter });
    }

    const code = gen();
    await store.set(k, { hash: hashCode(opts.secret, channelName!, to, code), expiresAt: t + ttlSec * 1000, attempts: 0, sentAt: t }, ttlSec);
    try {
      await channel.send(to, code, ctx);
    } catch (e) {
      await store.delete(k);
      throw new HttpError(502, { error: "delivery failed", reason: String(e instanceof Error ? e.message : e) });
    }
    return Response.json({ ok: true, channel: channelName, expiresIn: ttlSec });
  };

  const verify = async (ctx: Context): Promise<unknown> => {
    const body = (ctx.body ?? {}) as { channel?: string; to?: string; code?: string };
    const { channel: channelName, to, code } = body;
    if (!channelName || !to || !code) throw new HttpError(400, { error: "channel, to and code are required" });

    const k = key(channelName, to);
    const rec = await store.get(k);
    const t = now();
    if (!rec || rec.expiresAt < t) throw new HttpError(401, { error: "code invalid or expired" });
    if (rec.attempts >= maxAttempts) {
      await store.delete(k);
      throw new HttpError(429, { error: "too many attempts" });
    }

    if (!constantEq(rec.hash, hashCode(opts.secret, channelName, to, code))) {
      rec.attempts += 1;
      // Keep the record (don't delete) so that hitting the cap LOCKS the challenge
      // — a later correct guess is rejected by the attempts guard above.
      await store.set(k, rec, Math.max(1, Math.ceil((rec.expiresAt - t) / 1000)));
      throw new HttpError(401, { error: "invalid code", attemptsLeft: Math.max(0, maxAttempts - rec.attempts) });
    }

    await store.delete(k); // single-use
    return await opts.onVerify(ctx, { channel: channelName, to });
  };

  return { request, verify };
}

/**
 * One-time-password login as a ServerPlugin. Mounts the request/verify handlers
 * at `POST /otp/request` and `POST /otp/verify` by default — override the paths
 * with `routes` (or use {@link otpHandlers} for fully custom routing).
 * Codes are stored as salted HMACs, expire, are attempt-capped and rate-limited.
 */
export function otp(opts: OtpOptions): ServerPlugin {
  const { request, verify } = otpHandlers(opts);
  const basePath = (opts.basePath ?? "/otp").replace(/\/$/, "");
  const requestPath = opts.routes?.request ?? `${basePath}/request`;
  const verifyPath = opts.routes?.verify ?? `${basePath}/verify`;
  return {
    name: "otp",
    setup(app) {
      app.post(requestPath, request);
      app.post(verifyPath, verify);
    },
  };
}
