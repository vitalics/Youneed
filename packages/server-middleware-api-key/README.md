# @youneed/server-middleware-api-key

Shared-secret **API key** authentication for [`@youneed/server`](../server). The
simplest auth tier: the client presents a pre-issued secret key and it's matched
against a configured set — optionally mapped to a principal/scope. No structure,
no signature, no expiry — *"knows the secret ⇒ allowed"*. Best for
service-to-service / integration callers. **Always run it over TLS.**

```ts
import { Application } from "@youneed/server";
import { apiKey } from "@youneed/server-middleware-api-key";

// Flat allowlist (key sent as `X-API-Key: <key>`):
app.use(apiKey({ keys: [process.env.PARTNER_KEY!] }));

// Keys mapped to a principal → ctx.state.apiClient:
app.use(apiKey({ keys: { k_live_abc: { name: "billing", scopes: ["read"] } } }));

// Store only HASHES at rest (never plaintext keys):
app.use(apiKey({ hashed: true, keys: [sha256hex(process.env.PARTNER_KEY!)] }));

// Dynamic lookup (DB / cache):
app.use(apiKey({ verify: async (key) => db.clientByKey(key) }));
```

## Where the key comes from

By default the `X-API-Key` header. You can additionally accept it from a query
parameter or an `Authorization` scheme:

```ts
apiKey({ keys, header: "x-api-key", query: "api_key", scheme: "ApiKey" });
// X-API-Key: k…   |   ?api_key=k…   |   Authorization: ApiKey k…
```

## Matching & storage

Keys are matched by **SHA-256 digest**, not raw compare: the presented key is
hashed, then looked up in a table. This is constant-time-safe (preimage
resistance protects the secret — no per-character comparison against it) and lets
you store only digests via `hashed: true`.

## API key vs `bearer` / `jwt` / `authorization`

| | api-key | bearer | jwt / authorization |
| --- | --- | --- | --- |
| Token | opaque shared secret | opaque token | signed, self-contained |
| Verify | match a set / lookup | your `verify` callback | signature + claims |
| Lifetime | typically long-lived, manual rotation | per session | `exp` in token |
| Who | a service/integration | a user/session | a user/session |

It's "password login for machines". Use it for partner/integration access; reach
for `jwt`/`authorization` when you need signed, expiring, user-bound tokens.

## Options

| option | meaning |
| --- | --- |
| `keys` | Allowlist (`string[]`) or `key → principal` map. With `hashed` ⇒ SHA-256 hex. |
| `verify` | Dynamic `(key, ctx) => principal \| false` (DB lookup). |
| `header` | Key header (default `"x-api-key"`). |
| `query` | Also accept the key from this query param. |
| `scheme` | Also accept `Authorization: <scheme> <key>`. |
| `hashed` | `keys` entries are SHA-256 hex digests of the real keys. |
| `stateKey` | Where to put the principal (default `"apiClient"`). |
| `optional` | Let keyless requests through. |
| `status` | Status for a rejected request (default `401`). |
