# @youneed/feature-flags-vercel

A [Vercel Edge Config](https://vercel.com/docs/storage/edge-config) source for
[`@youneed/feature-flags`](../feature-flags). Store your flags in Edge Config —
Vercel's low-latency, globally-replicated key/value store — and this adapter
pulls them in as flag **definitions** the local engine evaluates synchronously.
Plain `fetch`, **no Vercel SDK required**.

```ts
import { createFlags } from "@youneed/feature-flags";
import { vercelSource } from "@youneed/feature-flags-vercel";

const flags = createFlags(
  vercelSource({
    connectionString: process.env.EDGE_CONFIG, // https://edge-config.vercel.com/<id>?token=<token>
    prefix: "flag:", // optional: only `flag:*` items, prefix stripped from the key
  }),
);

await flags.load(); // async source → fill the snapshot from Edge Config

flags.isEnabled("new-dashboard", { targetingKey: user.id }); // 20% rollout
flags.value("checkout", { targetingKey: user.id, attributes: { plan: user.plan } });
```

## Options

`vercelSource(opts)`:

| Option             | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `connectionString` | `https://edge-config.vercel.com/<id>?token=<token>` — parsed for `id` + `token`.      |
| `edgeConfigId`     | Edge Config id, used with `token` when no `connectionString` is given.                |
| `token`            | Read access token, used with `edgeConfigId`.                                          |
| `prefix`           | Import only items whose key starts with this; the prefix is stripped from the flag key. |
| `pollMs`           | `onChange` poll interval in ms. Default `30000`.                                      |
| `fetch`            | `fetch` implementation. Defaults to the global `fetch` (inject one in tests).         |
| `baseUrl`          | Edge Config read API base. Defaults to `https://edge-config.vercel.com`.              |

Provide **either** `connectionString` **or** both `edgeConfigId` and `token`.

## Edge Config value shapes

`all()` reads every item via `GET <baseUrl>/<id>/items?token=<token>` (which
returns `{ [key]: value }`) and maps each item to a `FlagDefinition`. An item can
hold **either** a simple value **or** a full flag definition:

```jsonc
{
  // simple value → { key: "beta", defaultValue: true }
  "beta": true,
  "theme": "dark",
  "limit": 42,

  // full flag def (has `defaultValue`) → passed through as the definition
  "checkout": {
    "defaultValue": "control",
    "variants": { "control": "control", "fast": "fast" },
    "rules": [{ "attributes": { "plan": "pro" }, "variant": "fast" }]
  },
  "new-dashboard": { "defaultValue": false, "rollout": 20 }
}
```

A value is treated as a full definition when it's a plain object with a
`defaultValue` field (`rules?` · `variants?` · `rollout?` · `enabled?` are then
honoured); everything else becomes `{ key, defaultValue: value }`.

## Live updates

`onChange` polls the Edge Config every `pollMs` (default 30s); when the fetched
JSON differs from the last seen, it fires the callback so the engine reloads.
The timer is `unref`'d so it never keeps a Node process alive. Stop polling with
`close()` — or scope the source with `using`:

```ts
using src = vercelSource({ connectionString: process.env.EDGE_CONFIG });
const flags = createFlags(src);
await flags.load();
// … src.close() runs automatically at end of scope
```

## Test

```bash
pnpm --filter @youneed/feature-flags-vercel test
```

The suite injects a fake `fetch` returning a fixed `/items` JSON — no network,
no Vercel account.
