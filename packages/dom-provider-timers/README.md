# @youneed/dom-provider-timers

Lifecycle-scoped timers for [`@youneed/dom`](../dom): the native timing APIs —
`setTimeout` / `setInterval` / `requestAnimationFrame` / `requestIdleCallback` /
the **Scheduler API** (`scheduler.postTask`, `scheduler.yield`) — contributed as
a typed `this.timers`, with everything **cancelled automatically when the
component disconnects**. A component can never leak an interval or fire a
callback after it left the DOM.

```ts
import { Component, html } from "@youneed/dom";
import { timersProvider } from "@youneed/dom-provider-timers";

class Clock extends Component("x-clock", { providers: [timersProvider()] }) {
  time = this.signal(new Date());

  onMount() {
    this.timers.setInterval(() => this.time.set(new Date()), 1_000);
    // no teardown code — cancelled on disconnect
  }

  render() {
    return html`<time>${this.time.get().toLocaleTimeString()}</time>`;
  }
}
```

Plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to and
composable with other providers (`dom-provider-i18n`, `-a11y`, `-color-scheme`, …).

## `this.timers`

| member | behaviour |
| --- | --- |
| `setTimeout(fn, ms?)` → `TimerHandle` | one-shot; auto-cancelled on disconnect |
| `setInterval(fn, ms?)` → `TimerHandle` | repeating; auto-cancelled on disconnect |
| `requestAnimationFrame(fn)` → `TimerHandle` | next frame (≈16 ms timeout fallback without a rAF) |
| `requestIdleCallback(fn, opts?)` → `TimerHandle` | idle time (timeout fallback where unsupported) |
| `delay(ms)` → `Promise<void>` | promise sleep; **rejects `AbortError`** if the component disconnects first |
| `postTask(task, opts?)` → `Promise<T>` | `scheduler.postTask` where available (`priority`/`delay`/`signal` honoured), else a timeout fallback; the task's signal is the component lifetime combined with `opts.signal` |
| `yield()` → `Promise<void>` | `scheduler.yield()` where available, else a macrotask hop — cede the main thread inside long work |
| `debounce(fn, ms)` | trailing-edge debounced wrapper (`.cancel()` to drop a pending call) |
| `throttle(fn, ms)` | leading + trailing throttled wrapper, latest args win |
| `clearAll()` | cancel everything scheduled through the registry |
| `active` | live-timer count (handy in tests) |
| `[Symbol.dispose]()` | alias of `clearAll()` — `using timers = createTimers(...)` |

`TimerHandle` is `{ cancel(): void; readonly pending: boolean }` — `pending`
flips to `false` once a one-shot fires or anything is cancelled.

## `Symbol.dispose` — TC39 explicit resource management

Everything cancellable is also **disposable** (same convention as
`@youneed/logger` and the component base itself): `TimerHandle`, the
`debounce`/`throttle` wrappers, and the whole `TimersApi` implement
`[Symbol.dispose]`, so `using` scopes them:

```ts
{
  using tick = this.timers.setInterval(render, 100);
  await this.timers.delay(1_000);
} // ← tick cancelled here, even on throw

using timers = createTimers();
timers.setInterval(poll, 5_000);
// end of scope → clearAll()
```

`using h = …` is equivalent to calling `h.cancel()` (or `clearAll()` for a
registry) at end of scope — pick whichever reads better; disconnect still
cleans up whatever is left.

It also works **top-down**: the component base itself is disposable, and its
`[Symbol.dispose]` runs the same teardown as disconnect — the provider's
`onCleanup` fires and `host.abortSignal` aborts, so `using el = new MyCard()`
stops every timer the instance ever scheduled.

```ts
class Search extends Component("x-search", { providers: [timersProvider()] }) {
  #lookup = this.timers.debounce((q: string) => this.fetchResults(q), 250);

  render() {
    return html`<input @input=${(e: Event) => this.#lookup((e.target as HTMLInputElement).value)} />`;
  }
}
```

```ts
// Long work that doesn't jank: yield between chunks, post the rest at background priority.
async processAll(items: Item[]) {
  for (const chunk of chunks(items, 50)) {
    chunk.forEach(process);
    await this.timers.yield();
  }
  await this.timers.postTask(() => reindex(), { priority: "background" });
}
```

## Standalone: `createTimers`

The same registry outside a component — pass any `AbortSignal` as its lifetime:

```ts
import { createTimers } from "@youneed/dom-provider-timers";

const ctl = new AbortController();
const timers = createTimers({ signal: ctl.signal });
timers.setInterval(poll, 5_000);
// …
ctl.abort(); // everything cancelled; later scheduling is inert
```

## Notes

- **SSR / non-DOM safe**: rAF, idle callbacks and the Scheduler API are probed
  at call time and fall back to timeouts (happy-dom / Node run fine).
- `AbortSignal`s are combined manually (not `AbortSignal.any`) — mixing native
  and happy-dom signals across realms breaks `any` under SSR.
- The provider uses the host's `abortSignal` **and** `onCleanup` for teardown,
  so timers die with the component either way.

## Build & test

```sh
pnpm --filter @youneed/dom-provider-timers run build
pnpm --filter @youneed/dom-provider-timers test
```
