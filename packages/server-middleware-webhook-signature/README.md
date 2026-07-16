# @youneed/server-middleware-webhook-signature

Verify inbound **webhook signatures** for [`@youneed/server`](../server). Confirms
a webhook genuinely came from the provider (Stripe, GitHub, Shopify, …) by
checking an HMAC over the **exact raw body** — and, with a tolerance, rejects
**replayed** requests. Zero dependencies.

## Two layers

```ts
// 1. A pure validation FUNCTION — no Context. Reusable anywhere (queue consumers,
//    tests, non-HTTP transports). Returns { valid, reason?, timestamp? }, never throws.
import { verifyWebhookSignature } from "@youneed/server-middleware-webhook-signature";

const result = await verifyWebhookSignature(
  { secret, header: "x-signature", prefix: "sha256=" },
  { rawBody, headers },
);
if (!result.valid) reject(result.reason);

// 2. The MIDDLEWARE wrapping it (reads the raw bytes via the core's memoized
//    rawBody(ctx), so the handler still gets a parsed ctx.body).
import { webhookSignature } from "@youneed/server-middleware-webhook-signature";
app.use("/hooks", webhookSignature({ secret, header: "x-signature", prefix: "sha256=" }));
```

## Per-provider subpaths

Ready-made providers are exported from `…/<provider>` subpaths:

```ts
import stripe from "@youneed/server-middleware-webhook-signature/stripe";
import github from "@youneed/server-middleware-webhook-signature/github";
import shopify from "@youneed/server-middleware-webhook-signature/shopify";

app.use("/webhooks/stripe", stripe(process.env.STRIPE_WHSEC!));
app.use("/webhooks/github", github(process.env.GH_WEBHOOK_SECRET!));
app.use("/webhooks/shopify", shopify(process.env.SHOPIFY_SECRET!));
```

The provider is the **default export**. Each subpath also has named exports for
the option preset (`stripeOptions`, `githubOptions`, `shopifyOptions`) so you can
verify off the HTTP path with `verifyWebhookSignature`.

## Build your own provider

Every provider is just the generic builder with a preset — do the same:

```ts
import { webhookSignature } from "@youneed/server-middleware-webhook-signature";

export function customProvider(secret: string) {
  return webhookSignature({
    secret,
    header: "x-acme-signature",
    prefix: "v1=",
    // parse MAY be async — parsing can hop to another service:
    async parse(headerValue) {
      const { signatures, timestamp } = await sigService.parse(headerValue);
      return { signatures, timestamp };
    },
  });
}
```

## Why over the raw body?

A signature is computed over the precise bytes the provider sent. Verifying
against a *re-serialized* `JSON.stringify(ctx.body)` would break on key-order or
whitespace differences — so `rawBody(ctx)` gives the untouched bytes.

## Options

| option | meaning |
| --- | --- |
| `secret` | Secret, a rotation set (`[]`, any match passes), or `(headers) => secret` (**async** — DB / per-tenant lookup). |
| `header` | Header carrying the signature (default `"x-signature"`). |
| `algorithm` | `"sha256"` (default) / `"sha1"` / `"sha512"`. |
| `encoding` | `"hex"` (default) / `"base64"`. |
| `prefix` | Stripped from the presented signature (e.g. `"sha256="`). |
| `parse` | Extract signature(s) + timestamp from the header — **may be async**. |
| `payload` | Build the signed payload from the raw body (+ timestamp). |
| `timestampHeader` / `toleranceSec` | Replay protection. |
| `stateKey` | Flag the verified request (+ timestamp) on `ctx.state`. |
| `status` | Rejection status (default `401`). |

Signatures are compared in constant time (`timingSafeEqual`).
