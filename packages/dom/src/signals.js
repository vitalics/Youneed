// ============================================================
// Signals — fine-grained reactive values (Preact / Angular style)
// ------------------------------------------------------------
// A `Signal<T>` is BOTH callable (Angular: `count()` reads) AND has a `.value`
// accessor (Preact: `count.value` reads/writes). Reading inside a `computed`
// or `effect` auto-subscribes that consumer; writing notifies subscribers.
// `Component`'s `this.signal()` binds a signal to the host so writes schedule a
// re-render — the same mental model as `@prop`, but value-typed and explicit.
// ============================================================
// The consumer currently executing — reads register themselves with it.
let activeSubscriber;
// `batch()` depth; while > 0, notifications queue instead of running.
let batchDepth = 0;
const batchQueue = new Set();
/** Register the active consumer as a subscriber of `subs` (a signal's set). */
function trackSignal(subs) {
    if (activeSubscriber) {
        subs.add(activeSubscriber);
        activeSubscriber.deps.add(subs);
    }
}
/** Notify a signal's subscribers — immediately, or queue them inside a batch. */
function notifySignal(subs) {
    // Snapshot: a subscriber's run() may re-track and mutate `subs`.
    for (const sub of [...subs]) {
        if (batchDepth > 0)
            batchQueue.add(sub);
        else
            sub.run();
    }
}
function flushBatch() {
    while (batchQueue.size) {
        const subs = [...batchQueue];
        batchQueue.clear();
        for (const sub of subs)
            sub.run();
    }
}
/** Detach a subscriber from every signal it was registered with. */
function unlinkSubscriber(sub) {
    for (const dep of sub.deps)
        dep.delete(sub);
    sub.deps.clear();
}
/**
 * Batch multiple writes so dependent effects run ONCE, after `fn` returns.
 * Without it, three writes to three signals re-run a shared effect three times.
 */
function batch(fn) {
    batchDepth++;
    try {
        return fn();
    }
    finally {
        if (--batchDepth === 0)
            flushBatch();
    }
}
/**
 * Create a standalone writable signal. For component state prefer
 * `this.signal()` (auto re-render + disposal); use this for store/module-level
 * reactive state shared across components.
 */
function createSignal(initial, options) {
    const equals = options?.equals ?? Object.is;
    let value = initial;
    const subs = new Set();
    const read = function () {
        trackSignal(subs);
        return value;
    };
    const write = (next) => {
        if (equals(value, next))
            return;
        value = next;
        notifySignal(subs);
    };
    Object.defineProperties(read, {
        value: { get: read, set: write, enumerable: true },
        peek: { value: () => value },
        set: { value: write },
        update: { value: (updater) => write(updater(value)) },
        subscribe: { value: (fn) => subscribeSignal(read, fn) },
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
function createComputed(compute, options) {
    const equals = options?.equals ?? Object.is;
    let value;
    let stale = true;
    const subs = new Set();
    const self = {
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
    const recompute = () => {
        unlinkSubscriber(self);
        const prev = activeSubscriber;
        activeSubscriber = self;
        try {
            const next = compute();
            if (stale || !equals(value, next))
                value = next;
            stale = false;
        }
        finally {
            activeSubscriber = prev;
        }
    };
    const read = function () {
        if (stale)
            recompute();
        trackSignal(subs);
        return value;
    };
    Object.defineProperties(read, {
        value: { get: read, enumerable: true },
        peek: {
            value: () => {
                if (stale)
                    recompute();
                return value;
            },
        },
        subscribe: { value: (fn) => subscribeSignal(read, fn) },
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
function createEffect(fn) {
    let cleanup;
    let active = true;
    const runCleanup = () => {
        if (typeof cleanup === "function") {
            const c = cleanup;
            cleanup = undefined;
            c();
        }
    };
    const self = {
        deps: new Set(),
        run() {
            if (!active)
                return;
            unlinkSubscriber(self);
            runCleanup();
            const prev = activeSubscriber;
            activeSubscriber = self;
            try {
                cleanup = fn() || undefined;
            }
            finally {
                activeSubscriber = prev;
            }
        },
    };
    self.run();
    return () => {
        if (!active)
            return;
        active = false;
        unlinkSubscriber(self);
        runCleanup();
    };
}
/** `.subscribe(fn)`: fire `fn` now (current value) and on every change. */
function subscribeSignal(read, fn) {
    return createEffect(() => {
        fn(read());
    });
}
export { batch, createSignal, createSignal as signal, createComputed, createComputed as computed, createEffect, createEffect as effect };
