// @youneed/server-middleware-webhook-signature/shopify
//
// Shopify: `X-Shopify-Hmac-Sha256: <base64 hmac of the raw body>` (secret = the
// app's API secret key / client secret).
import { webhookSignature, type WebhookSignatureOptions } from "./index.ts";
import type { Middleware } from "@youneed/server";

type Secret = WebhookSignatureOptions["secret"];

/** Build the option preset (reuse with `verifyWebhookSignature` off the HTTP path). */
export function shopifyOptions(secret: Secret, opts: Partial<WebhookSignatureOptions> = {}): WebhookSignatureOptions {
  return {
    secret,
    header: "x-shopify-hmac-sha256",
    algorithm: "sha256",
    encoding: "base64",
    ...opts,
  };
}

/** Shopify webhook signature middleware. */
export function shopify(secret: Secret, opts: Partial<WebhookSignatureOptions> = {}): Middleware {
  return webhookSignature(shopifyOptions(secret, opts));
}

export default shopify;
