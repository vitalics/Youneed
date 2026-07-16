# @youneed/secrets

A tiny, **framework-agnostic** secrets manager. One `SecretsProvider` contract;
the `Secrets` engine adds caching, **`secret://` reference resolution** (so config
can hold `secret://DB_PASSWORD` and be resolved at boot), and `require`. Env /
in-memory / JSON-file providers are built in; managed backends ship as adapters.

```ts
import { createSecrets, EnvSecrets } from "@youneed/secrets";

const secrets = createSecrets(new EnvSecrets(), { cacheTtlMs: 60_000 });

const dbUrl = await secrets.require("DATABASE_URL");          // throws if unset
const cfg = await secrets.resolveAll({                        // deep-resolve secret:// refs
  db: { url: "secret://DATABASE_URL" },
  stripe: "secret://STRIPE_KEY",
  port: 3000,
});
```

## Model

- **`SecretsProvider`** — `{ name, get(key), getMany?, list?, close? }`. `list()`
  returns NAMES only (never values) — safe for an audit/devtools view.
- **`Secrets`** — `get` / `require` (throws when missing) / `getMany` (cached),
  `resolve("secret://NAME")` and `resolveAll(config)` (deep), `list()`,
  `clearCache()`, `backend`. Options: `cacheTtlMs` (default 60s, `0` disables),
  `prefix` (namespacing), `now` (test clock).

## Built-in providers

- **`EnvSecrets(env = process.env)`** — the default.
- **`MemorySecrets(initial?)`** — tests / dev (`set(k,v)`).
- **`FileSecrets(path)`** — a flat JSON file (`{ "KEY": "value" }`), lazily loaded.

## Managed backends (adapters)

- **`@youneed/secrets-vault`** — HashiCorp Vault (KV v2).
- **`@youneed/secrets-aws`** — AWS Secrets Manager.
- **`@youneed/server-plugin-secrets`** — `this.secrets` on controllers + a devtools
  tab (secret NAMES + a masked resolve tester) + config hydration.

## A custom provider

```ts
const provider: SecretsProvider = {
  name: "my-vault",
  async get(key) { return (await myBackend.read(key))?.value; },
  async list() { return myBackend.keys(); },
};
createSecrets(provider);
```
