// @youneed/cli — async tasks, ported from @youneed/dom's `task`.
//
// A task wraps an async operation and exposes its state reactively:
// `pending`, `value`, `error`, `aborted`. Each state change calls
// `host.requestUpdate()`, which (under the CLI live renderer) repaints the
// command's output — so a `render()` that reads `task.value` redraws itself as
// the work resolves. The host here is the command instance; create tasks as
// fields (`#load = task(this, fetchRows)`) so `render` stays a pure function of
// state and can be re-invoked freely.

/** The minimum a task needs from its owner: a way to ask for a repaint. */
export interface ReactiveHost {
  /** Schedule a re-render. Called on every task state change. */
  requestUpdate(): void;
  /** Optional: register a task so the runtime can wait for it to settle. */
  registerTask?(task: TaskState): void;
}

/** Brand identifying a {@link Task} — used to reject awaiting one in `flow.await`. */
export const TASK_BRAND: unique symbol = Symbol.for("@youneed/cli.task");

/** The reactive surface a task exposes (subset used for liveness tracking). */
export interface TaskState {
  readonly pending: boolean;
}

/** Options for {@link task}. */
export interface TaskOptions {
  /** External signal; aborting it aborts the in-flight run. */
  signal?: AbortSignal;
}

/** The promise `run` returns — resolves to the value, or `undefined` on failure. */
export type TaskRun<R> = Promise<R | undefined>;

/** An async operation with reactive state. */
export interface Task<A extends unknown[], R, E = unknown> extends TaskState {
  /** @internal brand — a task self-renders, so `flow.await` rejects it. */
  readonly [TASK_BRAND]: true;
  /** Start (or restart) the task; a prior in-flight run is aborted. */
  run(...args: A): TaskRun<R>;
  /** Abort the in-flight run, if any. */
  abort(): void;
  /** True while a run is in flight. */
  readonly pending: boolean;
  /** True if the last run was aborted. */
  readonly aborted: boolean;
  /** The last run's error (unless it was an abort), else `undefined`. */
  readonly error: E | undefined;
  /** The last successful run's value, else `undefined`. */
  readonly value: R | undefined;
  /** True once at least one run has settled (succeeded, errored, or aborted). */
  readonly settled: boolean;
  /** Abort on scope exit (`using t = task(...)`). */
  [Symbol.dispose](): void;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Create a {@link Task} owned by `host`. `fn` receives the call arguments
 * followed by an `AbortSignal`. State changes call `host.requestUpdate()`.
 */
export function task<A extends unknown[], R>(
  host: ReactiveHost,
  fn: (...args: [...A, AbortSignal]) => Promise<R>,
  options: TaskOptions = {},
): Task<A, R> {
  let controller: AbortController | undefined;
  let runId = 0;
  let pending = false;
  let aborted = false;
  let started = false;
  let value: R | undefined;
  let error: unknown;

  const self: Task<A, R> = {
    [TASK_BRAND]: true,
    get pending() {
      return pending;
    },
    get aborted() {
      return aborted;
    },
    get error() {
      return error as unknown as undefined;
    },
    get value() {
      return value;
    },
    get settled() {
      return started && !pending;
    },
    run(...args: A): TaskRun<R> {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", () => controller!.abort(), { once: true });
      }
      const id = ++runId;
      pending = true;
      aborted = false;
      error = undefined;
      started = true;
      host.requestUpdate();

      return Promise.resolve(fn(...args, signal))
        .then((result) => {
          if (id === runId) value = result;
          return result;
        })
        .catch((err: unknown) => {
          if (id === runId) {
            if (isAbortError(err)) aborted = true;
            else error = err;
          }
          return undefined;
        })
        .finally(() => {
          if (id === runId) {
            pending = false;
            host.requestUpdate();
          }
        });
    },
    abort() {
      controller?.abort();
    },
    [Symbol.dispose]() {
      controller?.abort();
    },
  };

  host.registerTask?.(self);
  return self;
}
