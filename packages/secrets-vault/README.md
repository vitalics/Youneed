# @youneed/secrets-vault

HashiCorp **Vault (KV v2)** provider for
[`@youneed/secrets`](../secrets). Pure `fetch`, **no Vault SDK** — just the
token-auth header. Same `SecretsProvider` contract, so it drops straight into
`createSecrets()`.

```ts
import { createSecrets } from "@youneed/secrets";
import { vaultSecrets } from "@youneed/secrets-vault";

const secrets = createSecrets(
  vaultSecrets({
    address: "https://vault:8200",
    token: process.env.VAULT_TOKEN!,
    mount: "secret", // default
    // namespace: "team-a",   // Vault Enterprise → X-Vault-Namespace
  }),
);

const dbUrl = await secrets.require("db");        // reads secret/data/db
const pw = await secrets.get("db#password");      // one field from that path
const names = await secrets.list();               // secret NAMES only
```

## What it provides

It implements the `SecretsProvider` contract from `@youneed/secrets`:

- **`get(key)`** — `key` names a KV path under the mount. Issues
  `GET ${address}/v1/${mount}/data/${key}` with an `X-Vault-Token` header
  (plus `X-Vault-Namespace` when a `namespace` is set). Vault KV v2 nests the
  fields at `data.data`. Mapping:
  - a path holding a single **`value`** field → that value;
  - any other field map → the whole map as `JSON.stringify(...)`;
  - the **`"path#field"`** form → that specific field.
  - A `404` → `undefined`.
- **`list()`** — `LIST ${address}/v1/${mount}/metadata?list=true` → `data.keys`,
  with trailing `/` stripped. Returns **NAMES only** (never values).
- **`close()`** — a no-op (`fetch` is stateless).

## Options

| Option       | Default        | Notes                                             |
| ------------ | -------------- | ------------------------------------------------- |
| `address`    | —              | e.g. `"https://vault:8200"` (trailing `/` is trimmed) |
| `token`      | —              | sent as `X-Vault-Token`                           |
| `mount`      | `"secret"`     | KV v2 mount point                                 |
| `namespace`  | —              | Vault Enterprise → `X-Vault-Namespace`            |
| `fetch`      | global `fetch` | injectable (tests / custom agent)                 |
| `timeoutMs`  | —              | aborts the request via `AbortSignal.timeout`      |

## A Vault to test against

```bash
docker run --rm --cap-add=IPC_LOCK -e VAULT_DEV_ROOT_TOKEN_ID=root \
  -p 8200:8200 hashicorp/vault

# then, against the dev server (KV v2 is mounted at `secret/` by default):
export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root
vault kv put secret/db value=pg://localhost/app
vault kv put secret/stripe key=sk_test_123 webhook=whsec_456
```

```ts
const secrets = createSecrets(vaultSecrets({ address: "http://127.0.0.1:8200", token: "root" }));
await secrets.require("db");        // "pg://localhost/app"
await secrets.get("stripe#key");    // "sk_test_123"
```

> The Vault **dev server** is in-memory and unsealed with a fixed root token —
> for local testing only, never production.
