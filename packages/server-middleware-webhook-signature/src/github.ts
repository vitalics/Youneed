// @youneed/server-middleware-webhook-signature/github
//
// GitHub: `X-Hub-Signature-256: sha256=<hex hmac of the raw body>`.
import { webhookSignature, type WebhookSignatureOptions } from "./index.ts";
import type { Middleware } from "@youneed/server";

type Secret = WebhookSignatureOptions["secret"];

/** Build the option preset (reuse with `verifyWebhookSignature` off the HTTP path). */
export function githubOptions(secret: Secret, opts: Partial<WebhookSignatureOptions> = {}): WebhookSignatureOptions {
  return {
    secret,
    header: "x-hub-signature-256",
    algorithm: "sha256",
    encoding: "hex",
    prefix: "sha256=",
    ...opts,
  };
}

/** GitHub webhook signature middleware. */
export function github(secret: Secret, opts: Partial<WebhookSignatureOptions> = {}): Middleware {
  return webhookSignature(githubOptions(secret, opts));
}

export default github;
