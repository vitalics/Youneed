// ── @youneed/dom-provider-timers — lifecycle-scoped timers for components ────
//
// A composable `@youneed/dom` provider that contributes `this.timers`: the
// native timing APIs — `setTimeout` / `setInterval` / `requestAnimationFrame` /
// `requestIdleCallback` / the Scheduler API (`scheduler.postTask`,
// `scheduler.yield`) — scoped to the component's lifecycle. Everything
// scheduled through it is cancelled automatically on disconnect, so a
// component can never leak a timer or fire a callback after it left the DOM.
//
//   import { Component, html } from "@youneed/dom";
//   import { timersProvider } from "@youneed/dom-provider-timers";
//
//   class Clock extends Component("x-clock", { providers: [timersProvider()] }) {
//     time = this.signal(new Date());
//     onMount() {
//       this.timers.setInterval(() => this.time.set(new Date()), 1_000);
//     }
//     render() { return html`<time>${this.time.get().toLocaleTimeString()}</time>`; }
//   }
//
// The same registry is available standalone via `createTimers({ signal })` —
// handy outside components (pass any AbortSignal as the lifetime).

import type { ComponentProvider } from "@youneed/dom";

/** A cancellable handle for a scheduled callback. Disposable: `using tick =
 *  this.timers.setInterval(...)` cancels it at end of scope. */
export interface TimerHandle extends Disposable {
  /** Cancel the timer (no-op if it already fired or was cancelled). */
  cancel(): void;
  /** Still scheduled? `setTimeout`/`requestAnimationFrame`/`requestIdleCallback`
   *  flip to `false` after firing; `setInterval` only after `cancel()`. */
  readonly pending: boolean;
}

/** Options for {@link TimersApi.postTask} — mirrors the Scheduler API. */
export interface PostTaskOptions {
  /** Scheduler priority (native `scheduler.postTask` only; the fallback ignores it). */
  priority?: "user-blocking" | "user-visible" | "background";
  /** Delay before the task is queued, in ms. */
  delay?: number;
  /** Extra abort signal — combined with the component's lifetime. */
  signal?: AbortSignal;
}

/** A cancellable wrapped function (returned by `debounce` / `throttle`). */
export type CancellableFn<A extends unknown[]> = ((...args: A) => void) & {
  /** Drop the pending (trailing) invocation, if any. */
  cancel(): void;
} & Disposable;

/** The provider's contribution, exposed as `this.timers`. Disposable:
 *  `using timers = createTimers(...)` runs `clearAll()` at end of scope. */
export interface TimersApi extends Disposable {
  /** `setTimeout`, auto-cancelled on disconnect. */
  setTimeout(callback: () => void, ms?: number): TimerHandle;
  /** `setInterval`, auto-cancelled on disconnect. */
  setInterval(callback: () => void, ms?: number): TimerHandle;
  /** `requestAnimationFrame` (falls back to a ~16 ms timeout without a rAF),
   *  auto-cancelled on disconnect. */
  requestAnimationFrame(callback: (time: number) => void): TimerHandle;
  /** `requestIdleCallback` (falls back to a timeout where unsupported),
   *  auto-cancelled on disconnect. */
  requestIdleCallback(callback: (deadline: IdleDeadline) => void, options?: IdleRequestOptions): TimerHandle;
  /** Promise that resolves after `ms`. Rejects with an `AbortError` DOMException
   *  if the component disconnects (or `clearAll()` runs) first. */
  delay(ms: number): Promise<void>;
  /** `scheduler.postTask` where available (priority honoured), else a timeout
   *  fallback. The task's signal is the component lifetime combined with
   *  `options.signal`; rejects with the abort reason if aborted before running. */
  postTask<T>(task: () => T | Promise<T>, options?: PostTaskOptions): Promise<T>;
  /** `scheduler.yield()` where available, else a macrotask hop — lets the
   *  component cede the main thread inside long work. */
  yield(): Promise<void>;
  /** Debounced wrapper: trailing call after `ms` of silence. The pending
   *  invocation is dropped on disconnect. `.cancel()` drops it manually. */
  debounce<A extends unknown[]>(callback: (...args: A) => void, ms: number): CancellableFn<A>;
  /** Throttled wrapper: leading call immediately, trailing call at most every
   *  `ms`. The pending trailing invocation is dropped on disconnect. */
  throttle<A extends unknown[]>(callback: (...args: A) => void, ms: number): CancellableFn<A>;
  /** Cancel everything scheduled through this registry. */
  clearAll(): void;
  /** Live timers count (pending timeouts/intervals/frames/idles/delays/tasks). */
  readonly active: number;
}

// ── environment probes (SSR / happy-dom / Node safe) ─────────────────────────

interface SchedulerLike {
  postTask<T>(
    callback: () => T | Promise<T>,
    options?: { priority?: PostTaskOptions["priority"]; signal?: AbortSignal; delay?: number },
  ): Promise<T>;
  yield?(): Promise<void>;
}

const nativeScheduler = (): SchedulerLike | undefined =>
  (globalThis as { scheduler?: SchedulerLike }).scheduler;

const abortError = (): DOMException => new DOMException("The operation was aborted.", "AbortError");

/** Combine an optional pair of signals into one (undefined when both are).
 *  Manual combinator on purpose: `AbortSignal.any` breaks when mixing realms
 *  (e.g. native signals with happy-dom ones under SSR). */
const anySignal = (a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined => {
  if (!a) return b;
  if (!b) return a;
  const ctl = new AbortController();
  const forward = (s: AbortSignal) => () => ctl.abort(s.reason);
  if (a.aborted) ctl.abort(a.reason);
  else if (b.aborted) ctl.abort(b.reason);
  else {
    a.addEventListener("abort", forward(a), { once: true });
    b.addEventListener("abort", forward(b), { once: true });
  }
  return ctl.signal;
};

/** Create a standalone timer registry. Pass a `signal` as its lifetime —
 *  when it aborts, everything still scheduled is cancelled. */
export function createTimers(options: { signal?: AbortSignal } = {}): TimersApi {
  const lifetime = options.signal;
  // Every live timer registers a canceller here; cancellers must be idempotent
  // and remove themselves from the set when the timer settles on its own.
  const cancellers = new Set<() => void>();

  const track = (cancel: () => void): (() => void) => {
    let done = false;
    const once = (): void => {
      if (done) return;
      done = true;
      cancellers.delete(once);
      cancel();
    };
    cancellers.add(once);
    return once;
  };

  const clearAll = (): void => {
    for (const cancel of [...cancellers]) cancel();
  };

  if (lifetime) {
    if (lifetime.aborted) queueMicrotask(clearAll);
    else lifetime.addEventListener("abort", clearAll, { once: true });
  }

  const dead = (): boolean => lifetime?.aborted === true;

  // Already-settled handle for scheduling after the lifetime aborted.
  const inert: TimerHandle = { cancel() {}, pending: false, [Symbol.dispose]() {} };
  const handle = (cancel: () => void, isPending: () => boolean): TimerHandle => ({
    cancel,
    get pending() {
      return isPending();
    },
    [Symbol.dispose]: cancel,
  });

  const makeTimeout = (callback: () => void, ms?: number): TimerHandle => {
    if (dead()) return inert;
    let pending = true;
    const id = setTimeout(() => {
      pending = false;
      settle();
      callback();
    }, ms);
    const settle = track(() => {
      pending = false;
      clearTimeout(id);
    });
    return handle(settle, () => pending);
  };

  const api: TimersApi = {
    setTimeout: makeTimeout,

    setInterval(callback, ms) {
      if (dead()) return inert;
      let pending = true;
      const id = setInterval(callback, ms);
      const settle = track(() => {
        pending = false;
        clearInterval(id);
      });
      return handle(settle, () => pending);
    },

    requestAnimationFrame(callback) {
      const raf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
      if (!raf) return makeTimeout(() => callback(performance.now()), 16);
      if (dead()) return inert;
      let pending = true;
      const id = raf((time) => {
        pending = false;
        settle();
        callback(time);
      });
      const settle = track(() => {
        pending = false;
        cancelAnimationFrame(id);
      });
      return handle(settle, () => pending);
    },

    requestIdleCallback(callback, options) {
      const ric = (globalThis as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback;
      if (!ric) {
        // Timeout fallback with a spec-shaped, always-expiring deadline.
        return makeTimeout(
          () => callback({ didTimeout: true, timeRemaining: () => 0 } as IdleDeadline),
          options?.timeout ?? 0,
        );
      }
      if (dead()) return inert;
      let pending = true;
      const id = ric((deadline) => {
        pending = false;
        settle();
        callback(deadline);
      }, options);
      const settle = track(() => {
        pending = false;
        cancelIdleCallback(id);
      });
      return handle(settle, () => pending);
    },

    delay(ms) {
      return new Promise<void>((resolve, reject) => {
        if (dead()) return reject(abortError());
        let done = false;
        const id = setTimeout(() => {
          done = true;
          settle(); // deregister only — `done` guards the reject
          resolve();
        }, ms);
        const settle = track(() => {
          clearTimeout(id);
          if (!done) reject(abortError());
        });
      });
    },

    postTask<T>(task: () => T | Promise<T>, options: PostTaskOptions = {}): Promise<T> {
      const scheduler = nativeScheduler();
      const signal = anySignal(lifetime, options.signal);
      if (scheduler) {
        return scheduler.postTask(task, { priority: options.priority, delay: options.delay, signal });
      }
      // Fallback: a tracked timeout; priority is ignored.
      return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason ?? abortError());
        let started = false;
        const onAbort = (): void => settle();
        signal?.addEventListener("abort", onAbort, { once: true });
        const id = setTimeout(() => {
          started = true;
          settle(); // deregister only — `started` guards the reject
          try {
            resolve(task() as T);
          } catch (err) {
            reject(err);
          }
        }, options.delay ?? 0);
        const settle = track(() => {
          clearTimeout(id);
          signal?.removeEventListener("abort", onAbort);
          if (!started) reject(signal?.reason ?? abortError());
        });
      });
    },

    yield() {
      const scheduler = nativeScheduler();
      if (scheduler?.yield) return scheduler.yield();
      return api.delay(0).catch(() => {});
    },

    debounce<A extends unknown[]>(callback: (...args: A) => void, ms: number) {
      let pending: TimerHandle | undefined;
      const cancel = (): void => pending?.cancel();
      return Object.assign(
        (...args: A): void => {
          pending?.cancel();
          pending = makeTimeout(() => callback(...args), ms);
        },
        { cancel, [Symbol.dispose]: cancel },
      );
    },

    throttle<A extends unknown[]>(callback: (...args: A) => void, ms: number) {
      let last = -Infinity;
      let trailing: TimerHandle | undefined;
      const cancel = (): void => trailing?.cancel();
      return Object.assign(
        (...args: A): void => {
          const now = Date.now();
          const wait = last + ms - now;
          if (wait <= 0) {
            trailing?.cancel();
            trailing = undefined;
            last = now;
            callback(...args);
            return;
          }
          // Trailing edge: latest args win, one call per window.
          trailing?.cancel();
          trailing = makeTimeout(() => {
            trailing = undefined;
            last = Date.now();
            callback(...args);
          }, wait);
        },
        { cancel, [Symbol.dispose]: cancel },
      );
    },

    clearAll,

    get active() {
      return cancellers.size;
    },

    // TC39 explicit resource management: `using timers = createTimers(...)`.
    [Symbol.dispose]: clearAll,
  };

  return api;
}

/**
 * A composable `Component` provider contributing a typed `this.timers` —
 * `setTimeout` / `setInterval` / rAF / idle / `delay` / `postTask` / `yield` /
 * `debounce` / `throttle`, all cancelled automatically when the component
 * disconnects.
 */
export function timersProvider(): ComponentProvider<{ readonly timers: TimersApi }> {
  return {
    install(host) {
      const timers = createTimers({ signal: host.abortSignal });
      Object.defineProperty(host, "timers", { configurable: true, value: timers });
      // Belt and braces: disconnect may tear down before/without an abort tick.
      host.onCleanup(() => timers.clearAll());
    },
  };
}
