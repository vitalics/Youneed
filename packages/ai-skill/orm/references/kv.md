# @youneed/kv — NoSQL / KV Stores

A small KV contract with an in-process implementation, plus a Redis/Valkey adapter.
Source: `packages/kv/src/index.ts`, `packages/kv-redis/src/index.ts`.

## The `KV` contract

```ts
interface KV {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, opts?: { ttl?: number }): Promise<void>;   // ttl in seconds
  delete(key: string): Promise<void>;
  incr(key: string, opts?: { by?: number; ttl?: number }): Promise<number>;  // atomic; ttl only on creation
  expire(key: string, ttl: number): Promise<void>;
  ttl(key: string): Promise<number>;     // -2 missing, -1 no expiry, ≥0 seconds left
  scan?(prefix: string): Promise<string[]>;
  close?(): Promise<void>;
}
```

Values are **always strings** — the caller serializes (`JSON.stringify`, etc.). TTL
semantics match Redis. `incr` is race-free (atomic) and sets expiry only when it created the
key.

## MemoryKV — in-process

```ts
import { MemoryKV } from "@youneed/kv";
const kv = new MemoryKV({ sweepMs: 30_000 /* default; 0 disables periodic sweep */, now: () => Date.now() });
```

Backed by a `Map`, lazy expiry on `get` + periodic sweep. Single process only — not shared
across workers/instances. `now` is injectable for tests. Good default for dev and tests.

## namespaced — prefix isolation

```ts
import { namespaced } from "@youneed/kv";
const sessions = namespaced(backend, "sess");   // keys become "sess:<key>"
const limits   = namespaced(backend, "rl");      // keys become "rl:<key>"
```

Lets several consumers share one backend without key collisions; `scan()` strips the prefix
back off, `close()` delegates to the backend.

## redisKV — Redis / Valkey

```ts
import { redisKV, RedisKV } from "@youneed/kv-redis";
const kv = redisKV({ url: "redis://:pass@host:6379/2" });
// or discrete: redisKV({ host: "127.0.0.1", port: 6379, password, db: 2, connectTimeout: 5000 })
```

A hand-rolled RESP2 client over `node:net` (zero deps). Connection is lazy (opened on first
command), self-healing (exponential-backoff reconnect, `unref`'d timers), FIFO-pipelined.
`incr` uses an atomic Lua `INCRBY`+conditional `EXPIRE`. Needs a running Redis/Valkey
(`docker run --rm -p 6379:6379 valkey/valkey`). API-compatible with `MemoryKV` — swap by env:

```ts
const kv = process.env.REDIS_URL ? redisKV({ url: process.env.REDIS_URL }) : new MemoryKV();
```

## Where KV is used in the ecosystem

A single `KV` backend powers the distributed features (see the middleware skill for exact
options):

- **Distributed cache** — `createDistributedCache({ store: kv, ttl, staleWhileRevalidate })`
  from `@youneed/server`.
- **Sessions** — `session({ secret, store: new KvSessionStore(kv, { ttl }) })` from
  `@youneed/server-middleware-session`.
- **Rate limiting** — `rateLimit({ strategy: new KvFixedWindow(kv, { windowMs, max }) })`
  from `@youneed/server-middleware-rate-limit`.

Typical pattern: one backend, `namespaced` per consumer.

```ts
const backend = redisKV({ url: process.env.REDIS_URL! });
session({ secret, store: new KvSessionStore(namespaced(backend, "sess"), { ttl: 3600 }) });
rateLimit({ strategy: new KvFixedWindow(namespaced(backend, "rl"), { windowMs: 60_000, max: 100 }) });
```

## SQL vs KV — when to use which

- **@youneed/orm-sql** — relational/structured data, queries by fields, durable records.
- **KV** — ephemeral/high-churn state with TTL: sessions, counters/rate-limits, cache,
  feature flags. Reach for `MemoryKV` in one process, `redisKV` across many.
