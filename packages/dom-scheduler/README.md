# @youneed/dom-scheduler

A prioritized, batching render scheduler — **DOM- and Node-agnostic**. It only
coordinates "hosts" (`{ flush(), depth }`), so the same schedulers drive
`@youneed/dom` components on the client (real DOM) and during SSR/SSG.

- `createScheduler()` — microtask (render-blocking) + idle (background) batching.
- `syncScheduler` — renders inline (SSR/SSG).
- `createFpsScheduler(fps?)` / `rafScheduler` — frame loop + optional game tick;
  rAF where available, `setTimeout` fallback. Cancellable via `stop()` / `using`.
- `setDefaultScheduler()` / `getDefaultScheduler()` — the global default.
