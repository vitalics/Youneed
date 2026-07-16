// ============================================================
// Tasks — cancellable async (Angular / @lit/task style)
// ------------------------------------------------------------
// A field factory, not a decorator: TS can't retype a decorated method to add
// `.run`/`.pending` or drop the injected signal, so a typed factory gives full
// inference. Re-running aborts the previous run; an AbortSignal is injected as
// the last argument; `.pending`/`.error`/`.value` are reactive.
// ============================================================
/** Brands a `Task` and the promise returned by `task.run()`. `flow.await` checks
 *  for it to reject tasks (a task drives its own re-renders, so awaiting one in
 *  `render()` loops) — at the type level and, as a backstop, at runtime. */
const TASK_BRAND = Symbol("youneed.task");
/**
 * Lifecycle of the injected `AbortSignal` — the run is aborted (signal fires,
 * promise treated as a cancellation) when ANY of these happen:
 *   • `task.abort()` / `task[Symbol.dispose]()` is called explicitly;
 *   • `task.run()` is called again (the previous run is superseded);
 *   • the host disconnects/unmounts (via `host.onCleanup`);
 *   • an `options.signal` you passed in fires.
 * `fn` receives the signal as its LAST argument; honor it (e.g. pass to `fetch`,
 * or `signal.addEventListener("abort", …)`) to actually stop the work.
 */
function task(host, fn, options) {
    // Schedule the task's own reactive updates at this priority. For a background
    // refresh, its pending/value changes shouldn't block render-blocking UI.
    const priority = options?.priority;
    let controller;
    const state = {
        pending: false,
        aborted: false,
        error: undefined,
        value: undefined,
    };
    const abort = () => controller?.abort();
    host.onCleanup(abort); // unmount cancels an in-flight run
    // An external signal (your own controller) cancels the task too.
    const external = options?.signal;
    if (external) {
        external.addEventListener("abort", abort);
        host.onCleanup(() => external.removeEventListener("abort", abort));
    }
    return {
        [TASK_BRAND]: true,
        get pending() {
            return state.pending;
        },
        get aborted() {
            return state.aborted;
        },
        get error() {
            return state.error;
        },
        get value() {
            return state.value;
        },
        run(...args) {
            controller?.abort(); // supersede the previous run
            const mine = (controller = new AbortController());
            if (external?.aborted)
                mine.abort(); // already cancelled before we started
            // Only the CURRENT run may write shared state: a superseded run's late
            // settlement (it was aborted, but its promise still resolves/rejects on a
            // later tick) must not clobber the newer run's pending/value/error.
            const current = () => mine === controller;
            state.pending = true;
            state.aborted = false;
            state.error = undefined;
            host.requestUpdate(priority);
            const promise = Promise.resolve(fn(...args, mine.signal))
                .then((value) => {
                if (current())
                    state.value = value;
                return value;
            })
                .catch((err) => {
                if (!current())
                    return undefined;
                if (err?.name === "AbortError")
                    state.aborted = true;
                else
                    state.error = err;
                return undefined;
            })
                .finally(() => {
                if (!current())
                    return;
                state.pending = false;
                host.requestUpdate(priority);
            });
            // Brand the returned promise so `flow.await(task.run())` is caught.
            return Object.assign(promise, { [TASK_BRAND]: true });
        },
        abort() {
            controller?.abort();
        },
        [Symbol.dispose]() {
            controller?.abort();
        },
    };
}
export { task, TASK_BRAND };
