# youneed — Performance & Bottleneck Tuning

Diagnose first, then apply the targeted fix. Don't blanket-apply every item.

## @youneed/dom — frontend bottlenecks

**Symptom → cause → fix:**

- **Whole subtree rebuilds each render** → template identity changes between renders.
  Return the *same* `html` literal; never concatenate two `html``or build templates
  conditionally as strings. Use `when()`/`repeat()` inside one literal.
- **List re-renders / scroll jank on large lists** → unkeyed or full lists.
  Use `repeat(items, item => item.id, ...)` (keyed reconciliation), and for thousands
  of rows use `virtual(...)` from `@youneed/dom-provider-virtual` (only on-screen chunks live).
- **Expensive recompute on every render** → recomputing in `render()`.
  Move to `@Component.computed()` (cached, invalidated on reactive change).
- **Too many updates / layout thrash** → wrong scheduler or synchronous updates.
  Default `rafScheduler` batches per frame. For high-frequency UIs use
  `createFpsScheduler(60)` per component; use `syncScheduler` only in SSR/tests.
- **Slow first paint / heavy component** → Shadow DOM + styles cost.
  For leaf components that don't need style isolation/slots, `Component("tag", { shadow:false })`
  mounts faster (light DOM).
- **Leaks / dangling listeners** → manual listeners not cleaned up.
  Use `this.listen(...)`, `{ signal: this.abortSignal }`, or `this.onCleanup(...)` — all
  auto-tear-down on disconnect.
- **Janky async UI** → uncancelled fetches racing.
  Use `this.task(...)`; `.run()` aborts the prior run via the passed `signal`.

Measure with `examples/dom-vs-react` (fine-grained update demo) and
`examples/scheduler-react` (scheduler comparison). `packages/dom/bench` benchmarks
against lit/react/vue/angular.

## @youneed/server — backend bottlenecks

The hot path is already optimized in `server.ts`; the wins are mostly *using* it right:

- **Declare a `response` schema** on hot routes → compiles a fixed-field JSON serializer
  (no per-request property enumeration). This is the single biggest server-side win.
- **Static paths route O(1)** (method→path Map); avoid needless `:param` segments on hot routes.
- **Repeated identical responses** → add `createCache({ ttl, compile:true })` as scoped
  middleware; `compile:true` caches serialized bytes. `coalesce` (default on) single-flights
  concurrent identical requests (`x-cache: COALESCED`). For multi-node, `createDistributedCache`.
- **Read-heavy + occasional writes** → `staleWhileRevalidate` serves stale instantly and
  refreshes in the background; invalidate on writes with `cache.invalidate(...)`.
- **Overload / thundering herd** → `loadShed({ maxConcurrent })` fast-fails 503 instead of
  collapsing; `rate-limit` per client; `timeout(ms)` bounds tail latency.
- **Large payloads** → `compression()` + `body-limit` (reject before buffering).
- **Avoid `crypto.randomUUID()` per request** — the built-in `requestId` is a cheap
  per-process counter; reuse it instead of generating your own.
- **Don't write to `res` manually** unless streaming — returning a value/`Response` lets
  the framework take the synchronous fast path.
- **Profile real numbers** with `bench/bench.mjs` (hyperfine+curl) and `bench/load.mjs`
  (autocannon). Measure RPS and p99 before and after each change; don't trust micro-guesses.

## When asked "why is X slow?"

1. Confirm whether it's frontend (render/update) or backend (route/serialize/IO).
2. Reproduce with the relevant example/bench harness.
3. Apply the one matching fix above, re-measure, and report the delta — not just "should be faster".
