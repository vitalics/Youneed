# @youneed/kv-redis

**Back-compat alias.** The Redis/Valkey adapter moved to
[`@youneed/server-plugin-pubsub-redis`](../server-plugin-pubsub-redis) (which also
adds `RedisPubSub`); this package re-exports it so existing `@youneed/kv-redis`
imports keep working.

It's a `KV` ([`@youneed/server-plugin-store`](../server-plugin-store) contract)
backed by an external Redis/Valkey, speaking RESP directly over `node:net` — no
client dependency. Shared by every app instance behind a load balancer.

```ts
import { RedisKV, redisKV } from "@youneed/kv-redis";
import { namespaced } from "@youneed/server-plugin-store";

const kv = new RedisKV({ host: "127.0.0.1", port: 6379, password: "…" });
// or from a URL:  new RedisKV({ url: "redis://:pw@host:6379/0" })
// or the factory:  const kv = redisKV({ url: process.env.REDIS_URL });

await kv.set("user:1", JSON.stringify({ name: "Ada" }), { ttl: 60 });
await kv.incr("hits", { ttl: 60 });

const sessions = namespaced(kv, "sess");  // share one Redis across consumers
```

## `RedisKVOptions`

| option | default | meaning |
| --- | --- | --- |
| `host` | `127.0.0.1` | Redis host |
| `port` | `6379` | Redis port |
| `password` | — | `AUTH` password, sent on (re)connect |
| `url` | — | `redis://[:password@]host:port/db` — its fields override the above |

`RedisKV` implements the full `KV` contract (`get`/`set`/`delete`/`incr`/
`expire`/`ttl`/`scan`/`close`). The package also exports `RedisPubSub` /
`redisPubSub` — a `PubSub` implementation; see
[`@youneed/server-plugin-pubsub-redis`](../server-plugin-pubsub-redis) for that.

Prefer importing from
[`@youneed/server-plugin-pubsub-redis`](../server-plugin-pubsub-redis) in new code.
