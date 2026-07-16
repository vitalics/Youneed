// @youneed/server-middleware-webhook-signature/stripe
//
// Stripe: `Stripe-Signature: t=<unix>,v1=<hex hmac of `${t}.${body}`>`, with a
// default 5-minute replay tolerance.
import { webhookSignature, type WebhookSignatureOptions } from "./index.ts";
import type { Middleware } from "@youneed/server";

type Secret = WebhookSignatureOptions["secret"];

/** Build the option preset (reuse with `verifyWebhookSignature` off the HTTP path). */
export function stripeOptions(secret: Secret, opts: Partial<WebhookSignatureOptions> = {}): WebhookSignatureOptions {
  return {
    secret,
    header: "stripe-signature",
    algorithm: "sha256",
    encoding: "hex",
    toleranceSec: 300,
    parse: (value) => {
      const pairs = value.split(",").map((kv) => kv.split("="));
      const t = pairs.find(([k]) => k.trim() === "t")?.[1];
      const signatures = pairs.filter(([k]) => k.trim() === "v1").map(([, v]) => (v ?? "").trim());
      return { signatures, timestamp: t ? Number(t) : undefined };
    },
    payload: (raw, { timestamp }) => `${timestamp}.${raw.toString("utf8")}`,
    ...opts,
  };
}

/** Stripe webhook signature middleware. */
export function stripe(secret: Secret, opts: Partial<WebhookSignatureOptions> = {}): Middleware {
  return webhookSignature(stripeOptions(secret, opts));
}

export default stripe;
