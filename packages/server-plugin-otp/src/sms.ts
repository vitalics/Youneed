// @youneed/server-plugin-otp/sms
//
// An SMS OTP channel. SMS has no universal protocol, so the channel is built
// around a `send(to, text)` function you supply — plug any gateway. A `twilioSms`
// preset (Twilio REST over `fetch`) is included.

import type { OtpChannel } from "./index.ts";

type MaybePromise<T> = T | Promise<T>;

/** Send one text message to a recipient — implement with your SMS gateway. */
export type SmsSender = (to: string, text: string) => MaybePromise<void>;

export interface SmsChannelOptions {
  /** Your gateway sender (e.g. `twilioSms({...})`). */
  send: SmsSender;
  /** Message body builder (default `Your verification code is <code>`). */
  text?: (code: string) => string;
}

/** SMS OTP channel — delivers the code via your `send` gateway. */
export function smsChannel(opts: SmsChannelOptions): OtpChannel {
  return {
    name: "sms",
    async send(to, code) {
      await opts.send(to, opts.text ? opts.text(code) : `Your verification code is ${code}`);
    },
  };
}

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  /** Sender phone number or Messaging Service SID. */
  from: string;
  /** `fetch` impl (default global; inject for tests). */
  fetch?: FetchLike;
}

/** A Twilio-backed {@link SmsSender} (REST API over `fetch`). */
export function twilioSms(opts: TwilioOptions): SmsSender {
  const f = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`;
  const auth = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");
  return async (to, text) => {
    const body = new URLSearchParams({ To: to, From: opts.from, Body: text }).toString();
    const res = await f(url, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`twilio send failed (${res.status}): ${await res.text()}`);
  };
}
