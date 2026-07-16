# @youneed/server-plugin-kv

Mount a **KV store as a `ServerPlugin`** for [`@youneed/server`](../server). The
data layer is [`@youneed/server-plugin-store`](../server-plugin-store) (the `KV`
contract + `MemoryKV`); this package wraps any `KV` so its traffic is
**observable** — read/write/hit-rate counters, a ring buffer of recent ops, and a
live key browser in [`@youneed/server-plugin-devtools`](../server-plugin-devtools)
(Infra card, header tab, flow node).

It's the mirror of [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub)
(PubSub is to channels what this is to KV) and re-exports the store contract for
convenience, so a consumer needs a single import.

```ts
import { Application } from "@youneed/server";
import { createKV, kv } from "@youneed/server-plugin-kv";
// re-exported for convenience: MemoryKV, namespaced, type KV …

const store = createKV();        // TrackedKV around an in-process MemoryKV
// const store = createKV(new RedisKV({ url: process.env.REDIS_URL }));

const app = Application().plugin(kv(store));

// Pass the SAME tracked instance to your consumers so all traffic is counted:
await store.set("user:1", JSON.stringify({ name: "Ada" }), { ttl: 60 });
await store.get("user:1");       // recorded as a hit
store.stats();                   // → { gets, sets, deletes, incrs, hits, misses }
```

`TrackedKV` is itself a `KV` — every contract method delegates to the backend
unchanged, so it drops in anywhere a `KV` is expected.

## API

- **`createKV(backend?, opts?)`** — a `TrackedKV` around `backend` (default
  in-process `MemoryKV`). `opts.recent` caps the recent-ops ring buffer (default 25).
- **`new TrackedKV(backend?, { recent? })`** — the proxy class. Adds `.name`,
  `.scannable`, `.stats()` and `.recent()` on top of the `KV` contract.
- **`kv(store, opts?)`** — the `ServerPlugin` (name `"kv"`). Mounts an internal
  introspection API and an `inspect()` so devtools draws the KV node, header tab
  and key browser.

### `kv(...)` options (`KvPluginOptions`)

| option | default | meaning |
| --- | --- | --- |
| `basePath` | `"/__kv"` | internal route prefix |
| `exposeDevtools` | `true` | mount the introspection + browse/get/set/delete routes |
| `scanLimit` | `200` | max keys returned by the browse endpoint |

When `exposeDevtools` is on it serves, under `basePath`:

- `GET  /keys?prefix=` — list keys (+ ttl), capped at `scanLimit` (needs a
  scannable backend, else `501`)
- `GET  /get?key=` — `{ key, value, ttl }`
- `POST /set` — `{ key, value, ttl? }`
- `POST /delete` — `{ key }`

## Related

- [`@youneed/server-plugin-store`](../server-plugin-store) — the `KV` contract +
  `MemoryKV` (re-exported here).
- [`@youneed/kv-redis`](../kv-redis) — a shared Redis/Valkey backend to wrap.
- [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub) — the PubSub sibling.
