# @youneed/dom-scheduler ⨉ React — one source, eight strategies

One input (drag the slider, or hit **Auto-flood**) drives a single shared value.
Each block subscribes to it and commits to React with a different strategy,
counting its renders. The needle ticks once per React render — a calm needle =
few, frame-paced renders; a frantic, juddering needle = a storm of renders.

Measured over ~2s of auto-flood (~300 updates/s), renders:

| strategy | renders | note |
| --- | --- | --- |
| `react (native)` | ~660 | one render per update |
| `scheduler (default)` | ~660 | microtask batching can't help updates that already arrive in separate tasks — honest |
| `scheduler (sync)` | ~660 | `syncScheduler` commits inline → same as native |
| `react (raf)` | ~270 | honest rAF coalescing, one commit per frame |
| `scheduler (raf)` | ~270 | `rafScheduler` (`createFpsScheduler()`, uncapped) |
| `react (raf 60fps)` | ~110 | honest rAF + 60fps cap |
| `scheduler fps(60)` | ~110 | `createFpsScheduler(60)` |
| `scheduler (custom throttle 120ms)` | ~18 | **a hand-written scheduler** (~12 lines) |

Takeaways: a frame-paced strategy renders ~2–6× less than per-update for the same
input; the framework's scheduler is just a framework-agnostic host queue
(`{ flush: () => setState(latest), depth: 0 }` fed to `scheduler.request(...)`).

## Writing your own scheduler

The whole contract is `request(host)` + `flushSync()` (the rest is optional) — so
a custom policy is tiny. The demo's throttle scheduler, in full:

```ts
function createThrottleScheduler(ms: number): Scheduler {
  const pending = new Set<SchedulerHost>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => { const hosts = [...pending]; pending.clear(); for (const h of hosts) h.flush(); };
  const stop = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; pending.clear(); };
  return {
    name: `throttle(${ms})`,
    request(host) { pending.add(host); if (timer === undefined) timer = setTimeout(() => (timer = undefined, flush()), ms); },
    flushSync: flush,
    stop,
    [Symbol.dispose]: stop,
  };
}
```

Drop it into a component's `static scheduler` (or `Component(tag, { scheduler })`)
and the framework treats it like any built-in.

## …and the same thing in @youneed/dom

The third row renders the same comparison with `@youneed/dom` components fed the
same source. There's **no per-component wiring** — scheduling is declarative:

```ts
class DomBlock extends Component("dom-fps60", { scheduler: createFpsScheduler(60) }) {
  onMount() { this.#unsub = subscribe(() => (this.#value = store.value, this.requestUpdate())); }
  render() { /* renders in its own shadow root */ }
}
```

Measured renders match the hand-wired React+scheduler row exactly — e.g.
`dom (default)` ≈ `scheduler (default)`, `dom (fps 60)` ≈ `scheduler fps(60)`,
`dom (custom throttle)` ≈ `scheduler (custom throttle)` — so the framework gives
you the same batching for free, just by choosing a scheduler.

```sh
pnpm examples:serve:scheduler-react   # → http://localhost:8080
```
