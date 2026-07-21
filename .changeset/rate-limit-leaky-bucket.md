---
"@youneed/server-middleware-rate-limit": minor
---

New `LeakyBucket` rate-limit strategy (+ `"leaky-bucket"` shorthand): requests pour into a bucket that drains at `leakPerSec` — an instant burst up to `capacity`, then a strict one-per-interval pace. Implemented in the GCRA form (theoretical arrival time with burst tolerance `(capacity - 1) · interval`), the classic Nginx `limit_req` model — stable rejection boundaries where a naive water-level check flaps. The full built-in set is now: `FixedWindow` (`"fixed"`), `SlidingWindowLog` (`"sliding"`), `TokenBucket` (`"token-bucket"`), `LeakyBucket` (`"leaky-bucket"`), `ExponentialBackoff` (`"exponential"`).
