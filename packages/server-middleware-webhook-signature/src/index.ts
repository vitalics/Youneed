// ── @youneed/server-middleware-webhook-signature — verify inbound webhooks ───
//
// Confirms a webhook genuinely came from the provider by checking an HMAC over the
// EXACT raw request body (and, with a tolerance, rejecting replays). Two layers:
//
//   • `verifyWebhookSignature(opts, { rawBody, headers })` — a pure, Context-free
//     validation function returning `{ valid, reason?, timestamp? }`. Reusable
//     anywhere (queue consumers, tests, non-HTTP transports).
//   • `webhookSignature(opts)` — the @youneed/server Middleware wrapping it.
//
// Build your OWN provider on top of the generic builder:
//
//   import { webhookSignature } from "@youneed/server-middleware-webhook-signature";
//   export function customProvider(secret: string) {
//     return webhookSignature({ secret, header: "x-acme-signature", prefix: "v1=" });
//   }
//
// Ready-made providers live in subpaths (built the same way):
//   import { stripe } from "@youneed/server-middleware-webhook-signature/stripe";
//   import { github } from "@youneed/server-middleware-webhook-signature/github";
//   import { shopify } from "@youneed/server-middleware-webhook-signature/shopify";

import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, rawBody } from "@youneed/server";
import type { Middleware } from "@youneed/server";

export type MaybePromise<T> = T | Promise<T>;
export type WebhookAlgorithm = "sha256" | "sha1" | "sha512";
export type WebhookEncoding = "hex" | "base64";
type Secret = string | Buffer;
type HeaderBag = Record<string, string | string[] | undefined>;

export interface WebhookSignatureOptions {
  /** The signing secret — a value, a rotation set (any match passes), or a
   *  resolver (`(headers) => secret`, may be async — e.g. look up a per-tenant
   *  secret in a DB / another service). */
  secret: Secret | Secret[] | ((headers: HeaderBag) => MaybePromise<Secret | Secret[]>);
  /** Header carrying the signature (default `"x-signature"`). */
  header?: string;
  /** HMAC hash (default `"sha256"`). */
  algorithm?: WebhookAlgorithm;
  /** Hex or base64 signature encoding (default `"hex"`). */
  encoding?: WebhookEncoding;
  /** A prefix stripped from the presented signature before comparing (e.g.
   *  `"sha256="` for GitHub). */
  prefix?: string;
  /** Parse the signature header into one-or-more signatures + a timestamp (e.g.
   *  Stripe's `t=…,v1=…`). MAY BE ASYNC — parsing can hop to another service.
   *  Defaults to the whole value (minus `prefix`). */
  parse?: (headerValue: string) => MaybePromise<{ signatures: string[]; timestamp?: number }>;
  /** Build the signed payload from the raw body (+ parsed timestamp). Defaults to
   *  the raw body itself (Stripe signs `${t}.${body}`). */
  payload?: (raw: Buffer, info: { timestamp?: number }) => Buffer | string;
  /** A separate header carrying the request timestamp (unix seconds). */
  timestampHeader?: string;
  /** Reject when `|now - timestamp|` exceeds this (seconds) — replay protection. */
  toleranceSec?: number;
  /** Flag the verified request on `ctx.state[stateKey]` (with the timestamp). */
  stateKey?: string;
  /** Status for a failed verification (default `401`). */
  status?: number;
}

/** The inputs a pure verification needs — no `Context`, so it runs anywhere. */
export interface WebhookVerifyInput {
  rawBody: Buffer | string;
  headers: HeaderBag;
}

/** The outcome of `verifyWebhookSignature`. */
export interface WebhookVerifyResult {
  valid: boolean;
  /** Why it failed (when `valid` is false). */
  reason?: string;
  /** The parsed request timestamp, if any. */
  timestamp?: number;
}

const strip = (value: string, prefix?: string): string =>
  prefix && value.startsWith(prefix) ? value.slice(prefix.length).trim() : value.trim();

function eqEncoded(expected: Buffer, presented: string, encoding: WebhookEncoding): boolean {
  let given: Buffer;
  try {
    given = Buffer.from(presented, encoding);
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Pure signature validation — verify an HMAC signature over `rawBody` against the
 * configured secret(s). Returns `{ valid, reason?, timestamp? }` (never throws on
 * a bad signature). Use it directly off the HTTP path (queue consumers, tests),
 * or via the `webhookSignature` middleware.
 */
export async function verifyWebhookSignature(
  opts: WebhookSignatureOptions,
  input: WebhookVerifyInput,
): Promise<WebhookVerifyResult> {
  const headerName = (opts.header ?? "x-signature").toLowerCase();
  const headerValue = input.headers[headerName];
  if (typeof headerValue !== "string" || !headerValue) return { valid: false, reason: "missing signature header" };

  const parsed = opts.parse ? await opts.parse(headerValue) : { signatures: [strip(headerValue, opts.prefix)] };
  let timestamp = parsed.timestamp;
  if (timestamp === undefined && opts.timestampHeader) {
    const ts = input.headers[opts.timestampHeader.toLowerCase()];
    if (typeof ts === "string") timestamp = Number(ts);
  }

  // Replay protection.
  if (opts.toleranceSec !== undefined) {
    if (timestamp === undefined || !Number.isFinite(timestamp)) return { valid: false, reason: "missing timestamp", timestamp };
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > opts.toleranceSec) return { valid: false, reason: "timestamp outside tolerance", timestamp };
  }

  const presented = parsed.signatures.filter(Boolean);
  if (presented.length === 0) return { valid: false, reason: "no signature value", timestamp };

  const raw = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(input.rawBody);
  const data = opts.payload ? opts.payload(raw, { timestamp }) : raw;
  const algorithm = opts.algorithm ?? "sha256";
  const encoding = opts.encoding ?? "hex";

  const secretInput = typeof opts.secret === "function" ? await opts.secret(input.headers) : opts.secret;
  const secrets = Array.isArray(secretInput) ? secretInput : [secretInput];

  const ok = secrets.some((secret) => {
    const expected = createHmac(algorithm, secret).update(data).digest();
    return presented.some((sig) => eqEncoded(expected, sig, encoding));
  });
  return { valid: ok, reason: ok ? undefined : "signature mismatch", timestamp };
}

/**
 * Verify an inbound webhook's HMAC signature over the raw body, rejecting forged
 * or (with `toleranceSec`) replayed requests with a `status` (default 401) before
 * they reach the handler. The handler still gets a parsed `ctx.body` — the raw
 * bytes come from the core's memoized `rawBody(ctx)`.
 */
export function webhookSignature(opts: WebhookSignatureOptions): Middleware {
  const status = opts.status ?? 401;
  return async (ctx, next) => {
    const raw = await rawBody(ctx);
    const result = await verifyWebhookSignature(opts, { rawBody: raw, headers: ctx.request.headers });
    if (!result.valid) throw new HttpError(status, { error: "Invalid signature", reason: result.reason });
    if (opts.stateKey) ctx.state[opts.stateKey] = { verified: true, timestamp: result.timestamp };
    return next();
  };
}
