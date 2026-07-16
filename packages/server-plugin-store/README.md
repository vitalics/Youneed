# @youneed/server-plugin-store

The **distributed key-value contract** (`KV`) plus an in-process default
(`MemoryKV`). The framework never *hosts* shared state — it defines the contract
here and lets the deployment choose where data physically lives by plugging in an
adapter. Consumers (session store, rate-limit, cache) take a `KV` and don't care
which backend is behind it.

- **`MemoryKV`** — in this process, single instance. The default.
- **`RedisKV`** ([`@youneed/server-plugin-pubsub-redis`](../server-plugin-pubsub-redis),
  aliased by [`@youneed/kv-redis`](../kv-redis)) — an external Redis/Valkey shared
  by every app instance behind a load balancer.

> Values are **strings** — callers serialize (JSON, etc.). TTLs are in **seconds**.

```ts
import { MemoryKV, namespaced, type KV } from "@youneed/server-plugin-store";

const kv: KV = new MemoryKV();

await kv.set("user:1", JSON.stringify({ name: "Ada" }), { ttl: 60 });
await kv.get("user:1");          // → '{"name":"Ada"}'  (undefined once expired)
await kv.incr("hits", { ttl: 60 }); // → 1, atomic, expiry set only on creation
await kv.ttl("hits");            // → remaining seconds (-1 no expiry, -2 missing)

// Share one backend across consumers without key collisions:
const sessions = namespaced(kv, "sess");   // every key becomes "sess:<key>"
const rate = namespaced(kv, "rl");
```

## The `KV` contract

```ts
interface KV {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, opts?: SetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  incr(key: string, opts?: IncrOptions): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
  ttl(key: string): Promise<number>;   // ≥0 live · -1 no expiry · -2 missing
  scan?(prefix: string): Promise<string[]>;   // optional — for invalidation
  close?(): Promise<void>;                     // optional — release sockets
}
```

Every op is async (adapters may do network I/O). `scan`/`close` are optional —
callers must tolerate their absence.

- **`SetOptions`** — `{ ttl? }` (expiry seconds; omit for none).
- **`IncrOptions`** — `{ by?, ttl? }`. `by` is the amount (default 1); `ttl` sets
  expiry **only when this call creates the key** — applied atomically with the
  increment, so it's a race-free counter.

## `MemoryKV`

In-process `KV` backed by a `Map`, with lazy + periodic TTL expiry. Correct for a
single instance; **not** shared across processes.

```ts
new MemoryKV({ now: () => Date.now(), sweepMs: 30_000 });
```

- **`now`** — clock in epoch ms (injectable for tests).
- **`sweepMs`** — proactive sweep interval (default 30s; `0` disables the timer,
  entries still expire lazily on access).
- **`.size`** — entries currently held (after expiry).

## `namespaced(kv, ns)`

Wrap a `KV` so every key is transparently prefixed with `ns + ":"`. Lets several
consumers share one backend without colliding; `scan` is prefixed and the
namespace is stripped from results.

## Related

- [`@youneed/kv`](../kv) — back-compat alias re-exporting this package.
- [`@youneed/server-plugin-kv`](../server-plugin-kv) — mount a `KV` as a
  `ServerPlugin` with read/write/hit-rate tracking and a devtools key browser.
- [`@youneed/server-plugin-pubsub-redis`](../server-plugin-pubsub-redis) — the
  Redis adapter (`RedisKV`).
