import type { Priority } from "@youneed/dom-scheduler";
import type { ReactiveHost } from "./dom.ts";
/** Brands a `Task` and the promise returned by `task.run()`. `flow.await` checks
 *  for it to reject tasks (a task drives its own re-renders, so awaiting one in
 *  `render()` loops) — at the type level and, as a backstop, at runtime. */
declare const TASK_BRAND: unique symbol;
/** The promise `task.run()` returns — branded so `flow.await` can refuse it. */
type TaskRun<R> = Promise<R | undefined> & {
    readonly [TASK_BRAND]: true;
};
interface Task<A extends unknown[], R, E = unknown> {
    /** @internal marker — see {@link TASK_BRAND}. */
    readonly [TASK_BRAND]: true;
    run(...args: A): TaskRun<R>;
    /** Abort the in-flight run, if any (no-op when idle). The injected
     *  `AbortSignal` fires; the run settles as a cancellation, not an error. */
    abort(): void;
    readonly pending: boolean;
    /** True if the last run was aborted; reset to `false` when a new run starts. */
    readonly aborted: boolean;
    readonly error: E;
    readonly value: R | undefined;
    /** Abort the in-flight run (TC39 `using`) — same as `abort()`. */
    [Symbol.dispose](): void;
}
interface TaskOptions {
    /** Priority for the task's own pending/value/error re-renders. */
    priority?: Priority;
    /** An external signal that also aborts the task when it fires — e.g. your own
     *  `AbortController`, or a parent's. (The host's unmount already aborts it.) */
    signal?: AbortSignal;
}
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
declare function task<A extends unknown[], R>(host: ReactiveHost, fn: (...args: [...A, AbortSignal]) => Promise<R>, options?: TaskOptions): Task<A, R>;
export { task, TASK_BRAND };
export type { Task, TaskOptions, TaskRun };
