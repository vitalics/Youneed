# Auth & Identity — youneed

Two distinct concerns, often confused. Pick the right layer first.

- **Verify** a credential on every request (middleware) → api-key / bearer / jwt /
  authorization / ip-filter / webhook-signature.
- **Login** — obtain the user's identity once (a `ServerPlugin`) → `server-plugin-oauth2`
  (social/enterprise IdPs) or `server-plugin-otp` (passwordless code).

They compose: a login plugin proves identity → **you mint your own session/JWT** →
a verify middleware guards the API. Verify the exact option shapes against each
package README before asserting them.

## Choosing a verify middleware

| Need | Package | One-liner |
|------|---------|-----------|
| Service/integration key | `@youneed/server-middleware-api-key` | `apiKey({ keys: { "k_live_…": { name:"billing" } } })` |
| Opaque token (DB/session lookup) | `@youneed/server-middleware-bearer` | `bearer({ verify: async t => db.user(t) ?? false })` |
| Standard JWT (HS/RS/PS/ES, JWKS) | `@youneed/server-middleware-jwt` | `jwt({ jwks:"https://…/jwks.json", algorithms:["RS256"] })` |
| **Custom/national crypto** or HSM | `@youneed/server-middleware-authorization` | `authorization({ algorithm, key })` — bring your own `sign`/`verify` |
| HTTP Basic | `@youneed/server-middleware-basic-auth` | `basicAuth({ users:{ alice:"s3cret" } })` |
| Allow/deny by IP (CIDR) | `@youneed/server-middleware-ip-filter` | `ipFilter({ allow:["10.0.0.0/8"] })` — mount `trustProxy()` first |
| Inbound webhook authenticity | `@youneed/server-middleware-webhook-signature` | preset `stripe(secret)` / `github(secret)` |

All set the principal on `ctx.state` (`user` for token middleware, `apiClient`
for api-key) and reply `401` + `WWW-Authenticate` (`optional:true` to pass
through). Compares are constant-time. `jwt` stays standard-only — reach for
`authorization` when you need an algorithm `jwt` doesn't ship.

### api-key vs jwt vs bearer vs authorization
- **api-key** — shared secret (`X-API-Key`/query/scheme), matched by SHA-256 digest
  (`hashed:true` stores only hashes), optional `key → principal` map. "Password for machines."
- **bearer** — opaque token, *your* `verify` does the lookup (I/O each request).
- **jwt** — self-contained signed JWT, stateless, fixed algorithms + JWKS rotation.
- **authorization** — generic `Authorization`-header with a **pluggable** algorithm:
  `SigningAlgorithm { sign, verify, generatePair? }` (all may be async). `createTokens()`
  issues; `resolveKey(payload)` fetches the key per-request (rotation). Built-ins
  `hmacAlgorithm` / `ed25519Algorithm`.

### webhook-signature
Verifies an HMAC over the **raw body** (via the core's memoized `rawBody(ctx)`), so
the handler still gets a parsed `ctx.body`. Pure `verifyWebhookSignature(opts,{rawBody,headers})`
returns `{valid,reason?,timestamp?}`; the `webhookSignature(opts)` middleware wraps it.
Providers are **default exports** on subpaths — build your own via `webhookSignature({...})`:
```ts
import stripe from "@youneed/server-middleware-webhook-signature/stripe";
app.use("/webhooks/stripe", stripe(process.env.STRIPE_WHSEC!)); // t=,v1= + 5-min replay window
```
`parse` and `secret` may be async (signature parsed elsewhere, per-tenant secret).

## Login — OAuth2 / OIDC (`@youneed/server-plugin-oauth2`)

A `ServerPlugin` doing Authorization Code + **PKCE**, with a signed http-only state
cookie (CSRF + verifier). Providers are **named exports on subpaths**; you decide
what a session is in `onLogin`.

```ts
import { oauth2, redirect } from "@youneed/server-plugin-oauth2";
import { github } from "@youneed/server-plugin-oauth2/github";
import { google } from "@youneed/server-plugin-oauth2/google";

app.plugin(oauth2({
  secret: process.env.OAUTH_SECRET!,                 // signs the state cookie
  providers: {
    github: github({ clientId, clientSecret }),
    google: google({ clientId, clientSecret, offline: true }),
  },
  async onLogin(ctx, { provider, profile, tokens }) {
    const user = await db.upsert(provider, profile);
    ctx.cookies.set("uid", user.id, { httpOnly: true });
    return redirect("/");
  },
}));
// Mounts GET /auth/<provider> + /auth/<provider>/callback
```

**Bundled providers** (each `…/<name>`): `github google facebook yandex vk keycloak
auth0 clerk entra gitlab discord apple twitch linkedin slack spotify bitbucket okta
cognito`. Domain-scoped ones take config: `keycloak({ baseUrl, realm })`,
`auth0({ domain })`, `okta({ domain })`, `cognito({ region, poolDomain })`,
`entra({ tenant })`.

- **Build your own**: `defineProvider({ name, clientId, clientSecret, authorizeUrl,
  tokenUrl, userInfoUrl?, scopes, pkce?, fetchProfile?, profile })`. Use `fetchProfile`
  when the profile needs a non-standard call (GitHub `/user/emails`, VK `users.get`).
- **Custom routes**: pass `routes: { login, callback }` where each is `(provider) => path`
  (e.g. `login: (p) => "/login/" + p`). The callback builder also forms the
  `redirect_uri`, so they stay consistent. Or just change `basePath`.
- **Apple** (`…/apple`): `client_secret` is a signed ES256 JWT — use
  `appleClientSecret({ teamId, clientId, keyId, privateKey })`; with name/email scopes
  Apple POSTs the callback (`response_mode=form_post`) → set `cookieSameSite:"None"`.
- **Telegram** (`…/telegram`): NOT OAuth2 — Login Widget HMAC. `telegramLogin({ botToken,
  onLogin })` handler (mount yourself) + `verifyTelegramLogin(botToken, data)`.
- **Госуслуги/ЕСИА** (`…/gosuslugi`): NOT standard OAuth2 — `client_secret` is a
  per-request signature; supply a pluggable `sign(text)` (CryptoPro/HSM). `gosuslugi({...})`
  plugin + low-level `EsiaClient`.

Low-level building blocks are exported too: `pkcePair`, `buildAuthorizeUrl`,
`exchangeCode`, `fetchProfile`, `redirect`. Inject `fetch` to test without network.

## Login — OTP / passwordless (`@youneed/server-plugin-otp`)

A `ServerPlugin`: `POST /otp/request` (send a code) + `/otp/verify` (check → `onVerify`).
Codes are stored as salted HMACs, expire, are attempt-capped, single-use, and
rate-limited per recipient. Channels are pluggable.

```ts
import { otp } from "@youneed/server-plugin-otp";
import { emailChannel } from "@youneed/server-plugin-otp/email";   // built-in SMTP client
import { smsChannel, twilioSms } from "@youneed/server-plugin-otp/sms";

app.plugin(otp({
  secret: process.env.OTP_SECRET!,
  channels: {
    email: emailChannel({ host:"smtp.acme.dev", port:587, auth:{ user, pass }, from:"no-reply@acme.dev" }),
    sms:   smsChannel({ send: twilioSms({ accountSid, authToken, from:"+15550000000" }) }),
  },
  onVerify: (ctx, { channel, to }) => { /* create your session */ return { ok: true }; },
}));
```

- **Channels**: `email` (zero-dep SMTP: implicit TLS / STARTTLS / AUTH LOGIN), `sms`
  (wraps any `send(to,text)`; `twilioSms` preset). Build your own: `{ name, send(to,code,ctx) }`.
- **Custom routes**: `routes: { request, verify }`; or `otpHandlers(opts)` returns
  `{ request, verify }` to mount however you like (different method, a `Controller`).
- The code is **never** returned in a response — only delivered via the channel.

## Putting it together

```ts
// 1. login (oauth2/otp) → mint your own token   2. guard the API with it
app.plugin(oauth2({ /* … onLogin: set a session/JWT cookie */ }));
app.use("/api", jwt({ secret: process.env.JWT_SECRET! }));   // ctx.state.user on every /api call
```
