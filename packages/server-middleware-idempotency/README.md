# @youneed/server-middleware-idempotency

Stripe-style [`Idempotency-Key`](https://stripe.com/docs/api/idempotent_requests)
middleware for [`@youneed/server`](../server). Makes **unsafe** requests (`POST`,
`PUT`, `PATCH`, `DELETE`) safely retryable: the client sends a unique key per logical
operation, and a retry with the **same key** replays the first response instead of
running the handler again — so a double-click, a flaky network retry, or an at-least-once
webhook delivery results in **one** side effect, not many.

```ts
import { Application, Response } from "@youneed/server";
import { idempotency } from "@youneed/server-middleware-idempotency";

const app = Application()
  .use(idempotency({ ttl: 86400 }))               // 24h replay window (in-process store)
  .post("/charges", () => Response.json(charge())); // POST twice with one key → one charge
```

The client supplies the key:

```
POST /charges
Idempotency-Key: 7f9c2b1e-…        ← unique per logical operation, the client's choice
```

## Semantics

For each **keyed, unsafe** request the middleware keys off two KV entries
(`idem:res:<key>` and `idem:lock:<key>`):

1. **Replay** — if a result is already cached for the key, the handler is **not run**;
   the stored status, body and headers are returned with `Idempotent-Replayed: true`.
2. **Fingerprint mismatch → `422`** — a key is bound to the request that first used it.
   The fingerprint is `sha256(method + " " + url)`. Reusing the same key for a
   *different* request returns
   `422 { "error": "Idempotency-Key reused for a different request" }` (Stripe rejects a
   key reused for a different request; we use `422 Unprocessable Entity` for this
   client-mistake case, distinct from the in-flight `409` below).
3. **In-flight → `409`** — while one request holds the lock, a concurrent retry that
   races in gets `409 { "error": "A request with this Idempotency-Key is already in
   progress" }` plus `Retry-After: 1`. (The cache is re-checked once first, in case the
   leader just finished — then it replays instead.)

Requests **without** the header pass straight through untouched (no caching) — unless
`required: true`, which rejects them with
`400 { "error": "Idempotency-Key header required" }`. Safe methods (`GET`, `HEAD`, …)
always pass through.

### What is and isn't cached

Only **successful, JSON-serializable** results are cached. The middleware skips caching
(and releases the lock so a genuine retry can proceed) when the handler:

- returned a **5xx** — server errors should stay retryable;
- **streamed** the response (`headersSent` / `writableEnded`) — there's no buffered body
  to replay;
- produced a **non-serializable** body (`JSON.stringify` threw);
- **threw** — the lock is released and the error rethrown.

## The KV store — single instance vs a fleet

The replay cache and the in-flight lock live in a [`@youneed/kv`](../kv) `KV`:

- **Default** — a fresh in-process `MemoryKV`. Correct and zero-config for a **single
  instance**. Keys are not shared across processes, so behind a load balancer two
  instances wouldn't see each other's keys.
- **A fleet** — pass a **shared** store so every instance reads the same keys and the
  atomic lock serializes concurrent retries across the whole fleet:

  ```ts
  import { RedisKV } from "@youneed/kv-redis";
  app.use(idempotency({ store: new RedisKV({ url: process.env.REDIS_URL }) }));
  ```

The cross-instance lock is built on the KV's **atomic** `incr` used as `SETNX`
(`incr(lockKey) === 1` means *we* created it, so we own it). Within a single process two
concurrent same-key requests additionally **coalesce** onto one handler run.

## API

- **`idempotency(opts?)`** → `Middleware`. Register before the routes you want protected.

  | option     | default                              | meaning                                                              |
  | ---------- | ------------------------------------ | -------------------------------------------------------------------- |
  | `store`    | `new MemoryKV()`                     | KV backing the keys; share one (Redis) across a fleet.               |
  | `ttl`      | `86400`                              | seconds a cached result is retained (the replay window).             |
  | `lockTtl`  | `60`                                 | seconds the in-flight lock lives (ceiling on handler runtime).       |
  | `methods`  | `["POST","PUT","PATCH","DELETE"]`    | unsafe methods this applies to; others pass through.                 |
  | `header`   | `"idempotency-key"`                  | request header carrying the key.                                     |
  | `required` | `false`                              | reject keyless unsafe requests with `400` when `true`.               |
  | `prefix`   | `"idem:"`                            | KV key prefix.                                                       |

- **`IdempotencyOptions`** — the options type above.
