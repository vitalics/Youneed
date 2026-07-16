// ============================================================
// Signals — fine-grained reactive values (Preact / Angular style)
// ------------------------------------------------------------
// A `Signal<T>` is BOTH callable (Angular: `count()` reads) AND has a `.value`
// accessor (Preact: `count.value` reads/writes). Reading inside a `computed`
// or `effect` auto-subscribes that consumer; writing notifies subscribers.
// `Component`'s `this.signal()` binds a signal to the host so writes schedule a
// re-render — the same mental model as `@prop`, but value-typed and explicit.
// ============================================================

/** Equality used to skip no-op writes / recomputes (default `Object.is`). */
interface SignalOptions<T> {
  equals?: (a: T, b: T) => boolean;
}

/** A readable reactive value. Call it (`s()`) or read `s.value` to subscribe
 *  the active `computed`/`effect`; `s.peek()` reads without subscribing. */
interface ReadonlySignal<T> {
  (): T;
  readonly value: T;
  /** Read the current value WITHOUT subscribing the active consumer. */
  peek(): T;
  /** Run `fn` now with the current value, then on every change. Returns an
   *  unsubscribe. */
  subscribe(fn: (value: T) => void): () => void;
}

/** A writable reactive value. Write via `s.value = x`, `s.set(x)` or
 *  `s.update(prev => …)`. */
interface Signal<T> extends ReadonlySignal<T> {
  value: T;
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  /** A read-only view of this signal (hides the setters from consumers). */
  asReadonly(): ReadonlySignal<T>;
}

// A subscriber is an effect or a computed that read some signals. `run()`
// re-executes an effect, or invalidates a computed. `deps` is the set of
// signal subscriber-sets it is currently registered in, so it can unlink
// itself before each re-track (preventing stale dependencies).
interface ReactiveSubscriber {
  run(): void;
  deps: Set<Set<ReactiveSubscriber>>;
}

// The consumer currently executing — reads register themselves with it.
let activeSubscriber: ReactiveSubscriber | undefined;
// `batch()` depth; while > 0, notifications queue instead of running.
let batchDepth = 0;
const batchQueue = new Set<ReactiveSubscriber>();

/** Register the active consumer as a subscriber of `subs` (a signal's set). */
function trackSignal(subs: Set<ReactiveSubscriber>): void {
  if (activeSubscriber) {
    subs.add(activeSubscriber);
    activeSubscriber.deps.add(subs);
  }
}

/** Notify a signal's subscribers — immediately, or queue them inside a batch. */
function notifySignal(subs: Set<ReactiveSubscriber>): void {
  // Snapshot: a subscriber's run() may re-track and mutate `subs`.
  for (const sub of [...subs]) {
    if (batchDepth > 0) batchQueue.add(sub);
    else sub.run();
  }
}

function flushBatch(): void {
  while (batchQueue.size) {
    const subs = [...batchQueue];
    batchQueue.clear();
    for (const sub of subs) sub.run();
  }
}

/** Detach a subscriber from every signal it was registered with. */
function unlinkSubscriber(sub: ReactiveSubscriber): void {
  for (const dep of sub.deps) dep.delete(sub);
  sub.deps.clear();
}

/**
 * Batch multiple writes so dependent effects run ONCE, after `fn` returns.
 * Without it, three writes to three signals re-run a shared effect three times.
 */
function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    if (--batchDepth === 0) flushBatch();
  }
}

/**
 * Create a standalone writable signal. For component state prefer
 * `this.signal()` (auto re-render + disposal); use this for store/module-level
 * reactive state shared across components.
 */
function createSignal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const equals = options?.equals ?? Object.is;
  let value = initial;
  const subs = new Set<ReactiveSubscriber>();

  const read = function (): T {
    trackSignal(subs);
    return value;
  } as Signal<T>;

  const write = (next: T): void => {
    if (equals(value, next)) return;
    value = next;
    notifySignal(subs);
  };

  Object.defineProperties(read, {
    value: { get: read, set: write, enumerable: true },
    peek: { value: () => value },
    set: { value: write },
    update: { value: (updater: (prev: T) => T) => write(updater(value)) },
    subscribe: { value: (fn: (v: T) => void) => subscribeSignal(read, fn) },
    asReadonly: { value: () => read },
    [Symbol.toStringTag]: { value: "Signal" },
  });
  return read;
}

/**
 * Create a memoized derived signal. It recomputes lazily — only when read after
 * one of the signals it last read has changed — and re-subscribes its own
 * consumers transitively.
 */
function createComputed<T>(compute: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const equals = options?.equals ?? Object.is;
  let value: T;
  let stale = true;
  const subs = new Set<ReactiveSubscriber>();

  const self: ReactiveSubscriber = {
    deps: new Set(),
    run() {
      // A dependency changed → mark dirty and propagate to OUR consumers, but
      // don't recompute until someone actually reads us again (laziness).
      if (!stale) {
        stale = true;
        notifySignal(subs);
      }
    },
  };

  const recompute = (): void => {
    unlinkSubscriber(self);
    const prev = activeSubscriber;
    activeSubscriber = self;
    try {
      const next = compute();
      if (stale || !equals(value, next)) value = next;
      stale = false;
    } finally {
      activeSubscriber = prev;
    }
  };

  const read = function (): T {
    if (stale) recompute();
    trackSignal(subs);
    return value;
  } as ReadonlySignal<T>;

  Object.defineProperties(read, {
    value: { get: read, enumerable: true },
    peek: {
      value: () => {
        if (stale) recompute();
        return value;
      },
    },
    subscribe: { value: (fn: (v: T) => void) => subscribeSignal(read, fn) },
    [Symbol.toStringTag]: { value: "Computed" },
  });
  return read;
}

/**
 * Run `fn`, tracking every signal it reads, then re-run it whenever any of them
 * changes. `fn` may return a cleanup that runs before each re-run and on
 * disposal. Returns a disposer that stops the effect. Standalone effects are
 * NOT auto-stopped — store the disposer (or use `this.effect()` on a host).
 */
function createEffect(fn: () => void | (() => void)): () => void {
  let cleanup: void | (() => void);
  let active = true;

  const runCleanup = (): void => {
    if (typeof cleanup === "function") {
      const c = cleanup;
      cleanup = undefined;
      c();
    }
  };

  const self: ReactiveSubscriber = {
    deps: new Set(),
    run() {
      if (!active) return;
      unlinkSubscriber(self);
      runCleanup();
      const prev = activeSubscriber;
      activeSubscriber = self;
      try {
        cleanup = fn() || undefined;
      } finally {
        activeSubscriber = prev;
      }
    },
  };

  self.run();
  return () => {
    if (!active) return;
    active = false;
    unlinkSubscriber(self);
    runCleanup();
  };
}

/** `.subscribe(fn)`: fire `fn` now (current value) and on every change. */
function subscribeSignal<T>(read: () => T, fn: (value: T) => void): () => void {
  return createEffect(() => {
    fn(read());
  });
}


export { batch, createSignal, createSignal as signal, createComputed, createComputed as computed, createEffect, createEffect as effect };
export type { Signal, ReadonlySignal, SignalOptions };
