# @youneed/server-plugin-oauth2

OAuth2 / OIDC **login** for [`@youneed/server`](../server) — the Authorization
Code + PKCE flow ("Login with GitHub/Google"). This is the half that obtains a
user's **identity**; it's distinct from [`jwt`](../server-middleware-jwt) /
[`authorization`](../server-middleware-authorization), which **verify** a token on
each request. They compose: oauth2 logs the user in → you mint your own
session/JWT → those guard your API. Zero dependencies.

```ts
import { Application } from "@youneed/server";
import { oauth2, redirect } from "@youneed/server-plugin-oauth2";
import { github } from "@youneed/server-plugin-oauth2/github";
import { google } from "@youneed/server-plugin-oauth2/google";
import { facebook } from "@youneed/server-plugin-oauth2/facebook";
import { yandex } from "@youneed/server-plugin-oauth2/yandex";
import { vk } from "@youneed/server-plugin-oauth2/vk";

const app = Application().plugin(
  oauth2({
    secret: process.env.OAUTH_SECRET!,                  // signs the state cookie
    providers: {
      github: github({ clientId: process.env.GH_ID!, clientSecret: process.env.GH_SECRET! }),
      google: google({ clientId: process.env.G_ID!, clientSecret: process.env.G_SECRET!, offline: true }),
      facebook: facebook({ clientId: process.env.FB_ID!, clientSecret: process.env.FB_SECRET! }),
      yandex: yandex({ clientId: process.env.YA_ID!, clientSecret: process.env.YA_SECRET! }),
      vk: vk({ clientId: process.env.VK_ID!, clientSecret: process.env.VK_SECRET! }),
    },
    async onLogin(ctx, { provider, profile, tokens }) {
      const user = await db.upsert(provider, profile);  // YOU decide what a session is
      ctx.cookies.set("uid", user.id, { httpOnly: true });
      return redirect("/");
    },
  }),
);
// Mounts:  GET /auth/<provider>  &  /auth/<provider>/callback  for each provider
```

## Bundled providers

Named exports, each on its own subpath (`@youneed/server-plugin-oauth2/<name>`):

| import | provider | notes |
| --- | --- | --- |
| `github` | GitHub | primary email fetched from `/user/emails` |
| `google` | Google (OIDC) | PKCE on, `offline` for a refresh token |
| `facebook` | Facebook | Graph API; `apiVersion` option |
| `yandex` | Yandex | userinfo uses the `OAuth <token>` scheme |
| `vk` | VK (VKontakte) | email comes in the token response; profile via `users.get` |
| `keycloak` | Keycloak (OIDC) | `{ baseUrl, realm }` → realm-scoped endpoints |
| `auth0` | Auth0 (OIDC) | `{ domain, audience? }` |
| `clerk` | Clerk (OIDC) | `{ domain }` (Frontend API domain) |
| `entra` | Microsoft Entra ID (Azure AD) | `{ tenant }` (default `"common"`); Graph userinfo |
| `gitlab` | GitLab (OIDC) | `{ baseUrl? }` for self-managed |
| `discord` | Discord | builds the avatar CDN URL |
| `apple` | Sign in with Apple | see below — signed secret + `form_post` |
| `twitch` | Twitch | Helix profile (`Client-Id` header) |
| `linkedin` | LinkedIn (OIDC) | `/v2/userinfo` |
| `slack` | Sign in with Slack (OIDC) | |
| `spotify` | Spotify | profile via `/v1/me` |
| `bitbucket` | Bitbucket | email via `/user/emails` |
| `okta` | Okta (OIDC) | `{ domain, authServerId? }` |
| `cognito` | AWS Cognito (OIDC) | `{ region, poolDomain }` (Hosted UI) |

> **Convex** isn't here on purpose — it's a backend/database platform with its own
> Convex Auth that *consumes* OAuth providers (Clerk/Auth0/…); it's not an OAuth2
> IdP you "log in with". Use the providers above, then wire Convex behind them.

### Госуслуги / ЕСИА — `@youneed/server-plugin-oauth2/gosuslugi`

ЕСИА is **not** standard OAuth2: the `client_secret` is a detached **signature**
(PKCS7/CMS — usually GOST via CryptoPro) over `scope + timestamp + clientId +
state`, recomputed **per request**; the user `oid` comes from a signed `id_token`,
and the profile from REST calls to `/rs/prns/{oid}`. So it's a dedicated plugin
with a **pluggable signer** — you supply `sign(text) => signature` (CryptoPro
service, an HSM…); the framework isn't tied to one signer.

```ts
import { gosuslugi } from "@youneed/server-plugin-oauth2/gosuslugi";

app.plugin(gosuslugi({
  host: "https://esia.gosuslugi.ru",            // or the test stand
  clientId: "MY_SYSTEM",
  secret: process.env.STATE_SECRET!,            // signs the state cookie
  sign: (text) => cryptoProService.sign(text),  // detached signature (base64) — pluggable
  publicKey: esiaPublicKeyPem,                  // verify the RS256 id_token (or pass verifyIdToken for GOST)
  onLogin: (ctx, { profile, tokens }) => { /* your session */ return redirect("/"); },
}));
// GET /auth/esia  +  /auth/esia/callback
```

The low-level `EsiaClient` (`authLink` / `exchangeCode` / `userInfo` /
`parseIdToken`) is exported for fully manual wiring. The profile is normalized to
`{ id, firstName, lastName, middleName, trusted, email: { value, verified } | null }`.

### Sign in with Apple — `@youneed/server-plugin-oauth2/apple`

Apple has two quirks the plugin handles:

```ts
import { apple, appleClientSecret } from "@youneed/server-plugin-oauth2/apple";

app.plugin(oauth2({
  secret, onLogin,
  cookieSameSite: "None",        // ← required: Apple POSTs the callback cross-site (needs HTTPS)
  providers: {
    apple: apple({
      clientId: "com.acme.web",  // Services ID
      // client_secret is a SHORT-LIVED ES256 JWT signed with your .p8 key — minted per request:
      clientSecret: appleClientSecret({ teamId, clientId: "com.acme.web", keyId, privateKey: p8Pem }),
    }),
  },
}));
```

1. **`client_secret` is a signed ES256 JWT**, not a static string —
   `appleClientSecret({ teamId, clientId, keyId, privateKey })` mints it (the core
   resolves a function-typed `clientSecret` per request).
2. **`response_mode=form_post`** when `name`/`email` scopes are requested → Apple
   **POSTs** the callback. The plugin mounts both `GET` and `POST` callbacks and
   reads `code`/`state` from the form body; set `cookieSameSite: "None"` so the
   state cookie survives the cross-site POST. The profile comes from the
   `id_token` (Apple has no userinfo endpoint).

All take `{ clientId, clientSecret, scopes? }`; most also accept `pkce?`. They're
thin `defineProvider(...)` wrappers — read their source as templates.

## Custom routes

By default each provider mounts `GET /auth/<provider>` and
`/auth/<provider>/callback`. Change the prefix with `basePath`, or fully reshape
the paths with `routes` (the `callback` builder is also used for the
`redirect_uri`, so it stays consistent):

```ts
oauth2({
  secret, providers, onLogin,
  routes: {
    login:    (p) => `/login/${p}`,       // GET /login/github
    callback: (p) => `/callback/${p}`,    // GET /callback/github  (= redirect_uri)
  },
});
```

## Providers are universal — build your own

A provider is just endpoints + credentials + a `profile` mapper. The ready-made
ones (`/github`, `/google`) are named exports built on `defineProvider`; do the
same for any OAuth2/OIDC provider:

```ts
import { defineProvider } from "@youneed/server-plugin-oauth2";

export function discord(opts: { clientId: string; clientSecret: string }) {
  return defineProvider({
    name: "discord",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
    pkce: true,
    profile: (raw) => ({ id: String(raw.id), email: raw.email, name: raw.username, raw }),
  });
}
```

For providers that need a non-standard profile fetch (e.g. GitHub's primary email
lives at `/user/emails`), implement `fetchProfile(tokens, { fetch })` — it gets the
same injected `fetch`, so it stays testable.

## Telegram (Login Widget — not OAuth2)

Telegram doesn't use OAuth2: the **Login Widget** hands the browser fields signed
with HMAC-SHA256 (key = `SHA256(botToken)`). There's no authorize/token flow, so
it's a verifier + a route handler, not an `oauth2({ providers })` entry:

```ts
import { telegramLogin, verifyTelegramLogin } from "@youneed/server-plugin-oauth2/telegram";

app.get("/auth/telegram/callback", telegramLogin({
  botToken: process.env.TG_BOT_TOKEN!,
  onLogin: (ctx, user) => { ctx.cookies.set("uid", String(user.id), { httpOnly: true }); return redirect("/"); },
}));
```

Point the widget's `data-auth-url` at that route. `verifyTelegramLogin(botToken,
data, { maxAgeSec? })` is also exported for standalone use — it returns the user
or `null`, and rejects payloads older than `maxAgeSec` (default 1 day).

## How the flow is secured

- **PKCE** (`pkce: true`) — S256 `code_challenge` on the authorize URL, `code_verifier` on exchange.
- **State** — a random nonce in a **signed, http-only** cookie (`secret`), compared
  to the `state` the provider echoes back → CSRF / login-fixation protection.
- The cookie also carries the PKCE verifier, so the whole flow is browser-bound
  and **stateless** (no server-side store, works across instances).

## Low-level / reusable

The core exports the building blocks so you can drive the flow yourself:
`pkcePair()`, `buildAuthorizeUrl(provider, …)`, `exchangeCode(provider, …)`,
`fetchProfile(provider, tokens, fetch)`, `redirect(url)`, and the types
(`OAuthProvider`, `OAuthTokens`, `OAuthProfile`, `OAuthResult`, `FetchLike`).

## Options

| option | meaning |
| --- | --- |
| `secret` | Signs the state cookie (required). |
| `providers` | `{ key: provider }` — mounts `/{basePath}/{key}` + `/callback`. |
| `basePath` | Route prefix (default `"/auth"`). |
| `baseUrl` | Absolute origin for `redirect_uri` (default: derived from the request). |
| `onLogin(ctx, result)` | Called after success — create your session, return a result/redirect. |
| `onError(ctx, err)` | Failure handler (default → 401). |
| `fetch` | `fetch` for token/userinfo (default global; **inject for tests**). |
| `cookieName` / `cookieMaxAge` | State cookie name / lifetime (default `oauth2_state` / 600s). |

Testing is first-class: inject `fetch` to simulate the provider's token + userinfo
endpoints — no network, no real credentials (see this package's tests).
