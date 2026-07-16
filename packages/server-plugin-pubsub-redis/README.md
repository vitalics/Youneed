# @youneed/kv-redis

A [`@youneed/kv`](../kv) adapter backed by **Redis / Valkey**, with a
hand-rolled minimal RESP2 client over `node:net` — **no `ioredis` / `node-redis`
dependency** (this project hand-rolls its protocols).

## Where does the data live?

In an **external Redis/Valkey server you run** — not in the app process. That's
the whole point: unlike the built-in `MemoryKV` (correct only for a single
instance), a Redis-backed `KV` is **shared by every app instance** behind your
load balancer. Sessions, rate-limit counters and cache entries stay consistent
no matter which instance serves a given request.

```
┌────────┐   ┌────────┐   ┌────────┐
│ app #1 │   │ app #2 │   │ app #3 │   ← stateless app instances
└───┬────┘   └───┬────┘   └───┬────┘
    └────────────┼────────────┘
                 ▼
          ┌─────────────┐
          │ Redis/Valkey│             ← the operator runs this; the data lives here
          └─────────────┘
```

## Usage

```ts
import { redisKV } from "@youneed/kv-redis";
import { namespaced } from "@youneed/kv";

const kv = redisKV({ host: "127.0.0.1", port: 6379 });
// …or from a URL: redisKV({ url: "redis://:secret@cache.internal:6379/2" })

// Share one backend across consumers without key collisions:
const sessions = namespaced(kv, "sess");
const rate = namespaced(kv, "rl");

// Session store
await sessions.set(sid, JSON.stringify(data), { ttl: 1800 });
const raw = await sessions.get(sid);

// Rate limit — atomic, race-free counter; ttl applies only on creation:
const hits = await rate.incr(`ip:${ip}`, { by: 1, ttl: 60 });
if (hits > 100) throw new Error("rate limited");
```

## API

- **`redisKV(opts?)`** / **`new RedisKV(opts?)`** — construct the adapter.
  Options (`RedisKVOptions`):
  - `host` — default `127.0.0.1`.
  - `port` — default `6379`.
  - `password` — sent via `AUTH` on (re)connect.
  - `db` — logical DB index, `SELECT`ed on (re)connect.
  - `connectTimeout` — socket connect timeout in ms (default `5000`).
  - `url` — convenience `redis://[:password@]host:port/db`; fields it carries
    override the discrete options.

Implements the full `KV` contract: `get`, `set` (with `ttl` → `SET … EX`),
`delete` (`DEL`), `incr` (atomic `EVAL` Lua: `INCRBY`, then `EXPIRE` only when the
key was just created), `expire` (`EXPIRE`), `ttl` (`TTL`), `scan` (looped `SCAN …
MATCH prefix* COUNT 100`), and `close` (`QUIT` + socket teardown).

## How it works

- Commands are encoded as RESP arrays of bulk strings and written to the socket.
  Replies are parsed for the five RESP2 types (`+ - : $ *`, including nil
  `$-1`/`*-1`). Partial TCP chunks are buffered until a full reply is parsed.
- A **FIFO queue** of pending resolvers matches replies to commands — Redis
  answers in order, so pipelining works for free.
- The connection is **lazy** (opened on the first command) and **self-healing**:
  on a socket error/close, in-flight commands fail with a clear error and a
  reconnect is scheduled with exponential backoff (50ms → ~2s, timers `unref`'d).
  A command issued while disconnected triggers a (re)connect.

## Not a full Redis client

This is a **focused KV adapter** — it speaks only the commands `KV` needs. If you
want pub/sub, streams, transactions, cluster, etc., implement the small `KV`
interface yourself over `ioredis`/`node-redis` and plug that in instead; every
`@youneed/kv` consumer will accept it.
