---
"@youneed/server-middleware-rate-limit": minor
---

New `LeakyBucket` rate-limit strategy (+ `"leaky-bucket"` shorthand): requests pour into a bucket that drains at `leakPerSec` — an instant burst up to `capacity`, then a strict one-per-interval pace. Implemented in the GCRA form (theoretical arrival time with burst tolerance `(capacity - 1) · interval`), the classic Nginx `limit_req` model — stable rejection boundaries where a naive water-level check flaps. The full built-in set is now: `FixedWindow` (`"fixed"`), `SlidingWindowLog` (`"sliding"`), `TokenBucket` (`"token-bucket"`), `LeakyBucket` (`"leaky-bucket"`), `ExponentialBackoff` (`"exponential"`).

Also new: factory functions for every strategy — `fixedWindow()`, `slidingWindow()`, `tokenBucket()`, `leakyBucket()`, `exponentialBackoff()`, `kvFixedWindow(kv)` — matching the middleware-family convention (`cors()`, `helmet()`, `metrics()`, `tracing()`). `rateLimit({ strategy: tokenBucket({ capacity: 50, refillPerSec: 5 }) })` is now the primary documented form; the classes (for subclassing) and the string shorthands keep working unchanged.

Per-strategy deep imports — `@youneed/server-middleware-rate-limit/strategies/fixedWindow.js` (plus `slidingWindow.js`, `tokenBucket.js`, `leakyBucket.js`, `exponentialBackoff.js`, `kvFixedWindow.js`) — each subpath exports the class, the factory and the config type.

And the provider form: `rateLimitProvider()` — a `ControllerProvider` injecting `this.rateLimit` so controllers can drive the limiter themselves: `check(key?)` (verdict + `X-RateLimit-*` headers) and `enforce(key?)` (+ `Retry-After` and a 429 `HttpError` when limited), keyed off the ambient request like the middleware. For per-endpoint limits, conditional limiting, and multiple checks per request.
