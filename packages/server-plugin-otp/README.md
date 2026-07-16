# @youneed/server-plugin-otp

One-time-password login (passwordless / 2FA) for [`@youneed/server`](../server).
A user requests a short code for an identifier (phone or email), it's delivered
over a **channel**, and they submit it to verify. A `ServerPlugin` that mounts
`POST {basePath}/request` and `POST {basePath}/verify`. Zero dependencies.

```ts
import { Application } from "@youneed/server";
import { otp } from "@youneed/server-plugin-otp";
import { emailChannel } from "@youneed/server-plugin-otp/email";
import { smsChannel, twilioSms } from "@youneed/server-plugin-otp/sms";

const app = Application().plugin(
  otp({
    secret: process.env.OTP_SECRET!,                  // HMACs the stored code hash
    channels: {
      email: emailChannel({ host: "smtp.acme.dev", port: 587, auth: { user, pass }, from: "no-reply@acme.dev" }),
      sms:   smsChannel({ send: twilioSms({ accountSid, authToken, from: "+15550000000" }) }),
    },
    async onVerify(ctx, { channel, to }) {            // identity proven → your session
      const user = await db.upsertByContact(channel, to);
      ctx.cookies.set("uid", user.id, { httpOnly: true });
      return { ok: true };
    },
  }),
);
```

```
POST /otp/request  { "channel": "email", "to": "a@b.dev" }            → { ok, expiresIn }
POST /otp/verify   { "channel": "email", "to": "a@b.dev", "code": "…" } → onVerify result
```

## Custom routing

The default paths are `/otp/request` and `/otp/verify`. Override them with
`routes` (or change `basePath`):

```ts
otp({ secret, channels, onVerify, routes: { request: "/auth/code", verify: "/auth/code/check" } });
```

For *full* control — a different method, a `Controller`, extra guards — build the
handlers yourself with `otpHandlers()` and mount them however you like:

```ts
import { otpHandlers } from "@youneed/server-plugin-otp";
const { request, verify } = otpHandlers({ secret, channels, onVerify });
app.post("/login/start", request).post("/login/finish", verify);
```

## Security

- **The code is never returned** in a response — only delivered via the channel.
- Only a **salted HMAC** of the code (`secret`) is stored, never the code itself.
- Codes **expire** (`ttlSec`, default 300s), are **attempt-capped** (`maxAttempts`,
  default 5 — hitting the cap locks the challenge, so a later correct guess fails),
  **single-use** (consumed on success), and **rate-limited** per recipient
  (`resendCooldownSec`, default 60s → `429` + `Retry-After`).

## Channels are pluggable

A channel is just `{ name, send(to, code, ctx) }`. Two are bundled:

### email — `@youneed/server-plugin-otp/email`

Backed by a built-in, dependency-free **SMTP client** (`node:net` + `node:tls`):
implicit TLS (`secure: true`, port 465), STARTTLS upgrade (port 587), and
`AUTH LOGIN`.

```ts
emailChannel({
  host: "smtp.acme.dev", port: 587, auth: { user, pass },
  from: "Acme <no-reply@acme.dev>",
  subject: (code) => `Your code: ${code}`,        // string or (code) => string
  text: (code) => `Your verification code is ${code}.`,
  // html: (code) => `<b>${code}</b>`,
});
```

### sms — `@youneed/server-plugin-otp/sms`

SMS has no universal protocol, so the channel wraps a `send(to, text)` you supply
— plug any gateway. A `twilioSms({ accountSid, authToken, from })` preset (Twilio
REST over `fetch`) is included:

```ts
smsChannel({ send: twilioSms({ accountSid, authToken, from: "+15550000000" }) });
smsChannel({ send: async (to, text) => myGateway.send(to, text) }); // or your own
```

### build your own

Anything implementing `OtpChannel` works (push notification, WhatsApp, a test
spy…):

```ts
const pushChannel: OtpChannel = { name: "push", async send(to, code) { await push(to, `Code: ${code}`); } };
```

## Options

| option | meaning |
| --- | --- |
| `secret` | HMACs the stored code hash (required). |
| `channels` | `{ name: OtpChannel }` — the request body picks one. |
| `onVerify(ctx, { channel, to })` | Called on success — create your session. |
| `basePath` | Route prefix (default `"/otp"`). |
| `routes` | Override the mounted paths: `{ request?, verify? }` (absolute). |
| `codeLength` | Digits in the code (default 6). |
| `ttlSec` | Code lifetime (default 300). |
| `maxAttempts` | Verify attempts before lockout (default 5). |
| `resendCooldownSec` | Min seconds between sends to one recipient (default 60). |
| `store` | `OtpStore` (default in-memory; plug a KV-backed one for a fleet). |
| `generateCode` | Override generation (e.g. alphanumeric). |

For a multi-instance deployment, supply a shared `store` (the `OtpStore` shape is
satisfied by a KV-backed adapter) so codes verify on any node.
