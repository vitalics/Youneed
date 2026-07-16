# @youneed/server-middleware-authorization

Generic `Authorization`-header authentication for [`@youneed/server`](../server)
with a **pluggable signing algorithm**. Where [`jwt`](../server-middleware-jwt)
hard-codes HS/RS/PS/ES, this lets you bring your own `sign` / `verify` /
`generatePair` — Ed25519, GOST **Кузнечик**, a national crypto suite, an HSM,
anything — and issue + verify self-contained signed tokens with it.

```ts
import { sign, verify, generatePair } from "my-signing-algo";
import { authorization, createTokens } from "@youneed/server-middleware-authorization";

// 1. Wrap your algorithm (the package never inspects what it does):
const kuznyechik = { name: "Kuznyechik", sign, verify, generatePair };
const { publicKey, privateKey } = kuznyechik.generatePair();

// 2. Verify side — the middleware (any prefix you like):
app.use(authorization({ prefix: "Bearer", algorithm: kuznyechik, key: publicKey }));

// 3. Issue side — your login route:
const tokens = createTokens({ algorithm: kuznyechik, privateKey, publicKey });
const token = await tokens.sign({ sub: "u1", scope: "read" }, { expiresInSec: 3600 });

// 4. Handlers read the verified payload:
app.get("/me", (ctx) => ctx.state.user);
```

## How it relates to `jwt`

Both read `Authorization: <prefix> <token>` and stash the principal on
`ctx.state`. The difference is *who owns the crypto*:

| | `jwt` | `authorization` |
| --- | --- | --- |
| Token format | JWS (`header.payload.signature`) | `payload.signature` (algorithm-agnostic) |
| Algorithms | fixed: HS/RS/PS/ES | **any** — you supply `sign`/`verify` |
| Use it when | standard JWTs, JWKS, third-party IdPs | a custom/national cipher, an HSM, opaque tokens |

`jwt` is left untouched — use it for standard JWTs. Reach for `authorization`
when you need an algorithm `jwt` doesn't ship.

## The algorithm contract

```ts
interface SigningAlgorithm<PrivateKey, PublicKey = PrivateKey> {
  name?: string;
  sign(data: Uint8Array, key: PrivateKey): Uint8Array | Promise<Uint8Array>;
  verify(data: Uint8Array, signature: Uint8Array, key: PublicKey): boolean | Promise<boolean>;
  generatePair?(): { privateKey; publicKey } | Promise<…>;
}
```

`key` is opaque to the package — pass whatever your algorithm understands (a
secret, a `KeyObject`, raw bytes, an HSM handle). Symmetric algorithms can return
the same value for both keys.

### Self-contained signed tokens

`createTokens()` and the `algorithm` path of `authorization()` use a JWT-like but
algorithm-neutral format: `base64url(JSON(payload)) . base64url(signature)`, where
the signature covers the encoded payload segment. `sign()` stamps `iat` (and
`exp`/`nbf` from `SignOptions`, plus any single configured `iss`/`aud`/`sub`).
Claims (`exp`, `nbf`, `issuer`, `audience`, `subject`, `clockToleranceSec`) are
checked on verify.

## Async everywhere (DB / HSM / WebCrypto)

`sign`, `verify` and `generatePair` may all return a `Promise` — the middleware
awaits them. So an algorithm backed by an HSM, WebCrypto, or a DB round-trip just
works:

```ts
const hsm = {
  name: "HSM-ECDSA",
  sign: async (data, handle) => hsmClient.sign(handle, data),     // async OK
  verify: async (data, sig, key) => hsmClient.verify(key, data, sig),
};
```

### Resolving the key per-request (rotation / `kid`)

When keys rotate and live in a DB (à la JWKS), resolve the verification key per
token with `resolveKey` — it receives the token's *not-yet-verified* payload (so
you can read a `kid`/`iss`) and may be async. The signature is still the gate;
the payload is only trusted after it verifies.

```ts
app.use(authorization({
  algorithm: kuznyechik,
  resolveKey: async (payload) => db.publicKeyFor(payload.kid as string), // async OK
}));

// issue with a kid so the verifier can find the right key:
await tokens.sign({ sub: "u1", kid: "k-2026-06" });
```

A `resolveKey` that returns `null`/`undefined` (no such key) is a `401`.

## Opaque tokens / DB lookups

Skip the token format entirely — provide your own `verify`:

```ts
app.use(authorization({
  prefix: "Bearer",
  verify: async (token, ctx) => db.sessionByToken(token), // principal | false
}));
```

## Built-in reference algorithms

`hmacAlgorithm(secret, digest?)` (symmetric) and `ed25519Algorithm()`
(asymmetric, with `generatePair()`) ship as ready examples and templates for your
own.

## Options

| option | meaning |
| --- | --- |
| `prefix` | Scheme prefix, case-insensitive (default `"Bearer"`; `""` = no scheme). |
| `algorithm` + `key` | Verify self-contained signed tokens with your algorithm. |
| `resolveKey` | Per-request key resolver `(payload, ctx) => key` (async OK); overrides `key`. |
| `verify` | Custom `(token, ctx) => principal \| false` (opaque tokens). |
| `issuer` / `audience` / `subject` / `clockToleranceSec` | Claim checks (algorithm path). |
| `optional` | Let tokenless requests through. |
| `stateKey` | Where to put the principal (default `"user"`). |
| `scheme` / `realm` | `WWW-Authenticate` label/realm. |
