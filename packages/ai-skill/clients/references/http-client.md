# @youneed/http-client — resilient fetch (timeout + retry + circuit breaker)

Zero-dependency, universal wrapper over global `fetch` (Node ≥ 18, Bun, Deno, browser — only
`fetch` + `AbortController`/`AbortSignal`). Adds the three things every real outbound call needs.

```ts
import { createClient } from "@youneed/http-client";

const client = createClient({
  timeout: 5_000,        // per-attempt deadline (ms)
  retries: 3,            // up to 4 attempts
  failureThreshold: 5,   // trip the breaker after 5 consecutive failures
  resetTimeout: 30_000,  // stay OPEN this long before a half-open trial
});

const res = await client("https://api.example.com/users");            // callable like fetch
const created = await client.post("https://api.example.com/users", {  // + method helpers
  body: JSON.stringify({ name: "Ada" }), headers: { "content-type": "application/json" },
});
console.log(client.breaker.state);   // "closed" | "open" | "half-open"
```

## Timeout

Each attempt runs under an `AbortController` firing after `timeout` ms (default 10000, `0`
disables) → rejects with `TimeoutError`. A caller `init.signal` is **composed** with the
timeout (via `AbortSignal.any` when available), so an outside abort still works and is
distinguished from a timeout. The **sooner** of the two wins.

## Retry

Retried when an attempt **throws** (network error / `TimeoutError`) or returns a **retryable
status** (`retryStatuses`, default `[408,429,500,502,503,504]`).
- Backoff = `min(maxBackoff, backoff * 2^attempt)` with **full jitter** (`random()*computed`);
  defaults `backoff=200`, `maxBackoff=10000`.
- **`Retry-After`** (delta-seconds or HTTP-date) honored when larger than the computed backoff.
- Only **idempotent** methods retry by default (`GET/HEAD/PUT/DELETE/OPTIONS`). Override with
  `retryMethods`, or `retryNonIdempotent: true` for `POST`/`PATCH`.
- The caller's `signal` is respected **between** retries (abort stops the wait immediately).
- `retryOn(info)` fully replaces the default decision; `info = { error?, response?, attempt }`.

## Circuit breaker

One breaker per client (or per key via `breakerKey(input)`, e.g. per host). Counts
**consecutive** failures (thrown error, or 5xx/retryable — configurable via `isFailure`). It
wraps the **whole** retry sequence — one logical request = one breaker outcome.
```
closed ──(failureThreshold consecutive failures)──▶ open
open   ──(after resetTimeout ms)──▶ half-open
half-open ──success──▶ closed        half-open ──failure──▶ open (restart cooldown)
```
While **OPEN** the client throws `CircuitOpenError` *without calling fetch*. Usable standalone:
```ts
import { CircuitBreaker } from "@youneed/http-client";
const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 10_000 });
await cb.exec(() => doSomethingFlaky());   // cb.state, cb.reset()
```

## Key options

| Option | Default | Meaning |
|--------|---------|---------|
| `timeout` | `10000` | per-attempt deadline (ms), `0` disables |
| `retries` | `2` | retries after the first attempt |
| `backoff` / `maxBackoff` | `200` / `10000` | base / cap backoff (ms) |
| `retryStatuses` | `[408,429,500,502,503,504]` | statuses that retry |
| `retryMethods` / `retryNonIdempotent` | idempotent set / `false` | which methods retry |
| `retryOn(info)` / `isFailure(info)` | — | custom retry / breaker-failure decision |
| `failureThreshold` / `resetTimeout` | `5` / `30000` | trip threshold / OPEN cooldown |
| `breakerKey(input)` | — | per-key breakers (per host) |
| `fetch` / `now` / `random` / `sleep` | globals | injectable for tests |

**Exports:** `createClient`, `HttpClient`, `ClientOptions`, `CircuitBreaker`, `CircuitState`,
`TimeoutError`, `CircuitOpenError`.

Pass a client as `fetch` to a generated `@youneed/api-client` (see `references/api-client.md`)
so every API call inherits resilience. Don't blanket-retry non-idempotent writes without an
idempotency key (`@youneed/server-middleware-idempotency`).
