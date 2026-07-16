# @youneed/server-plugin-mailer

**Transactional email** for [`@youneed/server`](../server) with **pluggable
transports**. A backend-agnostic `MailTransport` contract sends a `MailMessage`;
pick a transport per provider — a built-in dependency-free SMTP client, or
AWS SES / SendGrid / Postmark over the global `fetch` (no SDKs). `mailer(...)` is
a `ServerPlugin` that records recent sends and — with
[`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted — surfaces
a **Mailer** tab (recent-sends table + a compose/send form).

```ts
import { Application } from "@youneed/server";
import { mailer } from "@youneed/server-plugin-mailer";
import { smtpTransport } from "@youneed/server-plugin-mailer/smtp";

const mail = mailer(
  smtpTransport({ host: "smtp.acme.dev", port: 587, auth: { user, pass }, from: "no-reply@acme.dev" }),
);

const app = Application().plugin(mail);
app.listen(3000);

// send from anywhere — use the plugin's tracked transport so devtools sees it
await mail.transport.send({
  to: "ada@x.dev",
  subject: "Welcome",
  text: "Hello!",
  html: "<b>Hello!</b>",
});
```

## Transports

| Transport                   | Import                                   | Backend                                                    |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `smtpTransport(opts)`       | `@youneed/server-plugin-mailer/smtp`     | Any SMTP server (TLS / STARTTLS / AUTH LOGIN). Built-in, dependency-free. |
| `sesTransport(opts)`        | `@youneed/server-plugin-mailer/ses`      | AWS SES v2 `SendEmail` HTTP API, signed with AWS SigV4 (`node:crypto`). |
| `sendgridTransport(opts)`   | `@youneed/server-plugin-mailer/sendgrid` | SendGrid v3 `POST /v3/mail/send` (Bearer key).             |
| `postmarkTransport(opts)`   | `@youneed/server-plugin-mailer/postmark` | Postmark `POST /email` (`X-Postmark-Server-Token`).        |

All of them implement `MailTransport` = `{ name, send(msg): Promise<MailResult> }`,
so you can also write your own.

```ts
// AWS SES (SigV4-signed, no aws-sdk)
import { sesTransport } from "@youneed/server-plugin-mailer/ses";
const ses = sesTransport({ region: "us-east-1", accessKeyId, secretAccessKey, from: "no-reply@acme.dev" });

// SendGrid
import { sendgridTransport } from "@youneed/server-plugin-mailer/sendgrid";
const sg = sendgridTransport({ apiKey: process.env.SENDGRID_KEY!, from: "no-reply@acme.dev" });

// Postmark
import { postmarkTransport } from "@youneed/server-plugin-mailer/postmark";
const pm = postmarkTransport({ serverToken: process.env.POSTMARK_TOKEN!, from: "no-reply@acme.dev" });

app.plugin(mailer(ses)); // …or sg / pm
```

## Messages

```ts
interface MailMessage {
  from?: string;               // defaults to the transport's `from`
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;               // text + html → multipart/alternative
  cc?: string | string[];
  bcc?: string | string[];     // envelope-only, never written to headers
  replyTo?: string;
  headers?: Record<string, string>;
}
interface MailResult { id?: string; accepted?: string[]; }
```

## The plugin

`mailer(transport, { basePath?, exposeDevtools? })` is a `ServerPlugin`. The
transport is wrapped in a `TrackedTransport` (a ring buffer of recent sends +
sent/failed counts); reach it via the returned `.transport`. Routes mount under
`basePath` (default `/__mailer`):

- **`GET /recent`** → `{ sends }` — the recent-sends ring buffer.
- **`POST /send`** `{ to, subject, text?, html? }` → `{ ok, id }` — send via the
  transport (used by the devtools compose form).

`inspect()` → `{ kind: "mailer", backend, sent, failed, recent, endpoints }`.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
mailer gets a **Mailer** panel (under Infra): a live recent-sends table
(to / subject / status / time) and a **compose / send** form. Registered by
importing `@youneed/server-plugin-mailer/devtools` into the devtools web bundle.
