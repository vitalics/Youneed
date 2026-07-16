# Secrets — @youneed/secrets + Vault / AWS + server plugin

Framework-agnostic secrets manager: one `SecretsProvider` contract; the `Secrets` engine
adds caching, **`secret://` reference resolution**, and `require`. Env / memory / JSON-file
providers built in; managed backends ship as adapters. Values never surface in listings.

## Core engine — `@youneed/secrets`

```ts
import { createSecrets, EnvSecrets } from "@youneed/secrets";

const secrets = createSecrets(new EnvSecrets(), { cacheTtlMs: 60_000 });

const dbUrl = await secrets.require("DATABASE_URL");           // throws if unset
const cfg = await secrets.resolveAll({                         // deep-resolve secret:// refs
  db: { url: "secret://DATABASE_URL" },
  stripe: "secret://STRIPE_KEY",
  port: 3000,
});
```

**Model**
- **`SecretsProvider`** — `{ name, get(key), getMany?, list?, close? }`. `list()` returns
  **NAMES only** (never values) — safe for an audit / devtools view.
- **`Secrets`** — `get` / `require` (throws when missing) / `getMany` (cached),
  `resolve("secret://NAME")`, `resolveAll(config)` (deep), `list()`, `clearCache()`, `backend`.
  Options: `cacheTtlMs` (default 60s, `0` disables), `prefix` (namespacing), `now` (test clock).

**Built-in providers:** `EnvSecrets(env = process.env)` (default), `MemorySecrets(initial?)`
(`set(k,v)`, tests/dev), `FileSecrets(path)` (flat JSON `{ "KEY": "value" }`, lazy).

**Custom provider:** implement `{ name, get, list? }` and pass it to `createSecrets(...)`.

## HashiCorp Vault — `@youneed/secrets-vault`

KV v2, pure `fetch`, no Vault SDK.
```ts
import { vaultSecrets } from "@youneed/secrets-vault";
const secrets = createSecrets(vaultSecrets({
  address: "https://vault:8200", token: process.env.VAULT_TOKEN!, mount: "secret", // default
  // namespace: "team-a",  // Vault Enterprise → X-Vault-Namespace
}));
await secrets.require("db");        // GET /v1/secret/data/db  (KV v2 nests fields at data.data)
await secrets.get("db#password");   // "path#field" → that single field
await secrets.list();               // LIST metadata → names only
```
Path holding a single `value` field → that value; any other field map → whole map as JSON;
`404` → `undefined`. Options: `address`, `token`, `mount` (`"secret"`), `namespace`, `fetch`,
`timeoutMs`.

## AWS Secrets Manager — `@youneed/secrets-aws`

Pure `fetch` + SigV4 signed with `node:crypto`, no `aws-sdk`.
```ts
import { awsSecrets } from "@youneed/secrets-aws";
const secrets = createSecrets(awsSecrets({
  region: "us-east-1", accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  // sessionToken, endpoint (LocalStack/VPC), fetch, timeoutMs (10000), date (test clock)
}), { cacheTtlMs: 60_000 });
await secrets.require("prod/db/url");    // GetSecretValue
await secrets.list();                    // ListSecrets (paged) → names only
```
`get` → `GetSecretValue` (`SecretString` verbatim, `SecretBinary` as base64, not-found →
`undefined`). `signV4(input)` is pure/injectable-clock for unit tests.

## Server — `@youneed/server-plugin-secrets`

> **🔒 Never exposes values over HTTP or devtools.** Routes surface secret **names** and a
> **masked** presence probe only (e.g. `sk•••ab`).

```ts
import { createSecrets, EnvSecrets, secrets, secretsProvider } from "@youneed/server-plugin-secrets";

const engine = createSecrets(new EnvSecrets(), { cacheTtlMs: 60_000 });

class BillingController extends Controller("/billing", { providers: [secretsProvider(engine)] }) {
  @Controller.post() async charge() {
    const key = await this.secrets.require("STRIPE_KEY");   // resolved server-side; never returned
    return { ok: true };
  }
}
Application(BillingController).plugin(secrets(engine)).listen(3000);
```
`secretsProvider(engine)` contributes `this.secrets` (the `Secrets` engine): `get` / `require`
/ `resolve("secret://…")` / `resolveAll(config)`. What (if anything) reaches the client is the
handler's call — the plugin's own routes never return a value.

**Plugin routes** under `basePath` (default `/__secrets`): `GET /` & `/names` (names + backend
id); `GET /health?name=` → `{ name, present, length?, preview? }` where `preview` is masked
(`sk•••OP`). Set `allowResolveTester: false` in prod so `/health` reports only `present`.

## Config hydration pattern

Keep config declarative with `secret://` refs and resolve once at boot:
```ts
const raw = { db: { url: "secret://DATABASE_URL" }, stripe: "secret://STRIPE_KEY", port: 3000 };
const config = await secrets.resolveAll(raw);   // values fetched from the active backend
```
Pairs with `@youneed/server-plugin-env` (fail-fast env validation) — env for plain vars,
secrets for sensitive material behind a managed backend.
