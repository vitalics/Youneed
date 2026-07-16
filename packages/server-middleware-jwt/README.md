# @youneed/server-middleware-jwt

JWT (JWS) authentication for [`@youneed/server`](../server). Verifies a
`Authorization: Bearer <jwt>` token's **signature** and **claims**, then stashes
the verified payload on `ctx.state`. Zero dependencies — signatures via
`node:crypto`, JWKS via global `fetch`.

```ts
import { Application } from "@youneed/server";
import { jwt } from "@youneed/server-middleware-jwt";

// Symmetric (HS256) — shared secret:
app.use(jwt({ secret: process.env.JWT_SECRET!, issuer: "auth.acme.dev", audience: "api" }));

// Asymmetric, single fixed key (RS256/ES256):
app.use(jwt({ publicKey: pemOrJwkOrKeyObject, algorithms: ["RS256"] }));

// Asymmetric via JWKS — keys rotate by `kid`, fetched and cached:
app.use(jwt({ jwks: "https://auth.acme.dev/.well-known/jwks.json", algorithms: ["RS256"] }));

// Handlers read the verified claims:
app.get("/me", (ctx) => ctx.state.user);
```

## What it checks

1. **Format** — three base64url segments (`header.payload.signature`).
2. **Algorithm allowlist** — `header.alg` must be in `algorithms` (defense against
   *alg-confusion*; defaults to `["HS256"]` with a secret, `["RS256"]` otherwise).
   `alg: none` is never accepted.
3. **Signature** — HMAC (HS\*), RSA-PKCS1 (RS\*), RSA-PSS (PS\*) or ECDSA (ES\*),
   256/384/512. HMAC uses a constant-time compare.
4. **Claims** — `exp`, `nbf` (with `clockToleranceSec`), and any configured
   `issuer` / `audience` / `subject`.

On any failure it responds `401` with a `WWW-Authenticate: Bearer …,
error="invalid_token"` challenge — unless `optional: true`, in which case a
request *without* a token passes through with the claims unset.

## Options

| option | meaning |
| --- | --- |
| `secret` | HMAC secret for HS\* (string/Buffer). |
| `publicKey` | A single PEM/JWK/`KeyObject` for RS\*/PS\*/ES\*. |
| `jwks` | A JWKS URL or inline `{ keys }`; keys resolved by `kid`. |
| `algorithms` | Allowed algorithms (allowlist). |
| `issuer` / `audience` / `subject` | Required claim values (string or one-of). |
| `clockToleranceSec` | Skew allowance for `exp`/`nbf` (default 0). |
| `optional` | Let tokenless requests through (default false). |
| `stateKey` | Where to put the payload on `ctx.state` (default `"user"`). |
| `realm` | `WWW-Authenticate` realm (default `"api"`). |
| `jwksTtlMs` | JWKS cache TTL (default 10 min). |

## JWT vs `bearer`

[`bearer`](../server-middleware-bearer) hands an opaque token to *your* `verify`
callback (DB lookup, introspection). `jwt` understands the token itself —
self-contained, stateless verification with no I/O (except an occasional JWKS
fetch). Use `bearer` for opaque/session tokens, `jwt` for signed JWTs.
