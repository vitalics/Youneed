---
"@youneed/dom-provider-timers": minor
---

New package: lifecycle-scoped timers for `@youneed/dom`. A composable provider contributing `this.timers` — `setTimeout` / `setInterval` / `requestAnimationFrame` / `requestIdleCallback` / `delay` + the Scheduler API (`postTask`, `yield`) + `debounce` / `throttle` — everything cancelled automatically when the component disconnects. All handles, wrappers and the registry implement `Symbol.dispose`, so `using` scopes them; `createTimers({ signal })` gives the same registry standalone.
