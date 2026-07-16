# @youneed/http-client

A **zero-dependency, universal** resilient wrapper over the global
[`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/fetch). Works in
Node ≥ 18, Bun, Deno and the browser — it only uses `fetch`, `AbortController`
and `AbortSignal`. It adds the three things every real outbound call needs:

- **Timeout** — abort each attempt after a deadline (composed with your own `signal`).
- **Retry** with exponential backoff + full jitter — honors `Retry-After`, and
  only retries idempotent methods by default.
- **Circuit breaker** — fail fast while a dependency is down.

```ts
import { createClient } from "@youneed/http-client";

const client = createClient({
  timeout: 5_000,        // per-attempt deadline (ms)
  retries: 3,            // up to 4 attempts
  failureThreshold: 5,   // trip the breaker after 5 consecutive failures
  resetTimeout: 30_000,  // stay OPEN this long before a half-open trial
});

// Callable like fetch …
const res = await client("https://api.example.com/users");

// … plus method helpers.
const created = await client.post("https://api.example.com/users", {
  body: JSON.stringify({ name: "Ada" }),
  headers: { "content-type": "application/json" },
});

// Introspect the breaker.
console.log(client.breaker.state); // "closed" | "open" | "half-open"
```

## Timeout

Each attempt runs under an `AbortController` that fires after `timeout` ms
(default `10000`, `0` disables). The attempt then rejects with a `TimeoutError`.
A caller-supplied `init.signal` is **composed** with the timeout (via
`AbortSignal.any` when available, else manual wiring), so aborting from outside
still works — and is distinguished from a timeout.

```ts
const client = createClient({ timeout: 2_000 });
try {
  await client.get(url, { signal: AbortSignal.timeout(500) }); // caller's wins if sooner
} catch (e) {
  if (e instanceof TimeoutError) { /* our deadline */ }
}
```

## Retry

A request is retried when an attempt **throws** (network error / `TimeoutError`)
or returns a **retryable status** (`retryStatuses`, default
`[408, 429, 500, 502, 503, 504]`).

- Backoff between attempts is `min(maxBackoff, backoff * 2^attempt)` with **full
  jitter** (`random() * computed`). Defaults: `backoff = 200`, `maxBackoff = 10000`.
- **`Retry-After`** (delta-seconds or HTTP-date) is honored — if present and
  larger than the computed backoff, the client waits that instead.
- Only **idempotent** methods are retried by default (`GET/HEAD/PUT/DELETE/OPTIONS`).
  Override with `retryMethods`, or set `retryNonIdempotent: true` to include
  `POST`/`PATCH`.
- The caller's `signal` is respected **between** retries — an abort stops the
  wait and rejects immediately.
- `retryOn(info)` fully replaces the default decision; `info` is
  `{ error?, response?, attempt }`.

## Circuit breaker

One breaker per client (or per key via `breakerKey(input)`, e.g. per host). It
counts **consecutive** failures (a thrown error, or a 5xx/retryable response —
configurable via `isFailure`). The breaker wraps the **whole** retry sequence, so
one logical request is one breaker outcome.

```
closed ──(failureThreshold consecutive failures)──▶ open
open   ──(after resetTimeout ms)──▶ half-open
half-open ──success──▶ closed       half-open ──failure──▶ open (restart cooldown)
```

While **OPEN** the client throws `CircuitOpenError` *without calling fetch*. The
breaker is also usable standalone:

```ts
import { CircuitBreaker } from "@youneed/http-client";

const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 10_000 });
const value = await cb.exec(() => doSomethingFlaky());
cb.state;   // "closed" | "open" | "half-open"
cb.reset(); // force closed
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `timeout` | `10000` | Per-attempt deadline (ms). `0` disables. |
| `retries` | `2` | Retries after the first attempt (→ up to 3 attempts). |
| `backoff` | `200` | Base backoff (ms). |
| `maxBackoff` | `10000` | Cap on a single backoff delay (ms). |
| `retryStatuses` | `[408,429,500,502,503,504]` | Statuses that trigger a retry. |
| `retryMethods` | idempotent set | Methods eligible for retry. |
| `retryNonIdempotent` | `false` | Also retry `POST`/`PATCH`. |
| `retryOn(info)` | — | Custom retry decision (replaces the default). |
| `isFailure(info)` | retryable/5xx | What counts as a breaker failure. |
| `failureThreshold` | `5` | Consecutive failures that trip the breaker OPEN. |
| `resetTimeout` | `30000` | OPEN cooldown (ms) before half-open. |
| `breakerKey(input)` | — | Per-key breakers (e.g. per host). |
| `fetch` | global `fetch` | Underlying fetch (injectable for tests). |
| `now` | `Date.now` | Clock (ms), injectable for tests. |
| `random` | `Math.random` | Jitter source in `[0,1)`, injectable for tests. |
| `sleep(ms, signal?)` | real timer | Backoff sleep, injectable for tests. |

## Exports

`createClient`, `HttpClient` (type), `ClientOptions` (type), `CircuitBreaker`
(class), `CircuitState` (type), `TimeoutError`, `CircuitOpenError`.
