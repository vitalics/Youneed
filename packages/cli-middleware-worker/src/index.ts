// @youneed/cli-middleware-worker — offload work to worker threads, as a task.
//
//   class Hash extends Command("hash <file>", { middleware: [worker()] }) {
//     async execute(file: string) {
//       const job = this.worker.run((path) => {
//         const { readFileSync } = require("node:fs");
//         const { createHash } = require("node:crypto");
//         return createHash("sha256").update(readFileSync(path)).digest("hex");
//       }, file);
//       console.log(await job.exited);
//     }
//   }
//
// `this.worker.run(fn, data)` runs `fn(data)` on a worker thread and returns a
// reactive handle (running/result/error/exited) — the run is a `task`, so a
// `render` repaints as it progresses, and the runtime TERMINATES the thread on
// graceful shutdown (SIGINT/SIGTERM) or teardown. `fn` is shipped by source, so
// it must be self-contained (no closures — pass everything via `data`, and
// `require(...)` what you need). `this.worker.spawn(file)` runs a worker module
// for message-passing/persistent work. Namespaced under `this.worker` to keep
// the command's `this` uncluttered.

import { Worker, type WorkerOptions } from "node:worker_threads";
import { contribute, task, type CliMiddleware, type ReactiveHost } from "@youneed/cli";

// ESM bootstrap (a data: URL) that rebuilds `fn` from source and runs it. The
// worker is an ES module, so `require` isn't global — we build one (resolving
// from the cwd) and pass it to `fn` as its second argument.
const RUN_BOOTSTRAP = `
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/index.js");
(async () => {
  try {
    const fn = (0, eval)("(" + workerData.__src + ")");
    const value = await fn(workerData.__data, require);
    parentPort.postMessage({ ok: true, value });
  } catch (err) {
    parentPort.postMessage({ ok: false, message: err && err.message ? String(err.message) : String(err) });
  }
})();
`;
const RUN_URL = new URL("data:text/javascript," + encodeURIComponent(RUN_BOOTSTRAP));

/** A reactive handle to a one-shot {@link WorkerApi.run}. */
export interface WorkerHandle<T> {
  /** True while the worker is running. */
  readonly running: boolean;
  /** The result once it finishes, else `undefined`. */
  readonly result?: T;
  /** An error if the worker threw or exited abnormally. */
  readonly error?: unknown;
  /** Resolves with the result when it finishes (never rejects; `undefined` on error). */
  readonly exited: Promise<T | undefined>;
  /** Terminate the worker thread now. */
  terminate(): void;
  /** `using h = this.worker.run(...)` terminates on scope exit. */
  [Symbol.dispose](): void;
}

/** A handle to a spawned worker module ({@link WorkerApi.spawn}). */
export interface WorkerInstance {
  /** True while the worker is alive. */
  readonly running: boolean;
  /** Send a message to the worker. */
  postMessage(message: unknown): void;
  /** Subscribe to messages from the worker; returns an unsubscribe fn. */
  onMessage(handler: (message: unknown) => void): () => void;
  /** Terminate the worker now. */
  terminate(): void;
  /** Resolves with the exit code when the worker exits. */
  readonly exited: Promise<number>;
  [Symbol.dispose](): void;
}

/** The `this.worker` surface contributed by {@link worker}. */
export interface WorkerApi {
  /**
   * Run `fn(data, require)` on a worker thread. `fn` is shipped by source — keep
   * it self-contained (no closures; load modules via the injected `require`;
   * pass inputs via `data`). `data` and the result must be structured-cloneable.
   */
  run<R, D = unknown>(
    fn: (data: D, require: NodeRequire) => R | Promise<R>,
    data?: D,
  ): WorkerHandle<Awaited<R>>;
  /** Run a worker module (file or URL) for message-passing / persistent work. */
  spawn(entry: string | URL, opts?: WorkerOptions): WorkerInstance;
}

/**
 * Worker-thread middleware. Adds `this.worker` with `run` (one-shot offload) and
 * `spawn` (a worker module). Every worker is bound to the command and terminated
 * on graceful shutdown and teardown.
 */
export function worker(): CliMiddleware<{ readonly worker: WorkerApi }> {
  return {
    name: "worker",
    install(ctx) {
      const host = ctx.command as unknown as ReactiveHost;

      const run = <R, D = unknown>(
        fn: (data: D, require: NodeRequire) => R | Promise<R>,
        data?: D,
      ): WorkerHandle<Awaited<R>> => {
        const w = new Worker(RUN_URL, { workerData: { __src: fn.toString(), __data: data } });
        let result: Awaited<R> | undefined;
        let errored: unknown;
        const terminate = (): void => void w.terminate();
        const job = task(host, (signal: AbortSignal) =>
          new Promise<Awaited<R>>((resolve, reject) => {
            let settled = false;
            signal.addEventListener("abort", terminate, { once: true });
            w.once("message", (m: { ok: boolean; value?: Awaited<R>; message?: string }) => {
              if (settled) return;
              settled = true;
              if (m.ok) {
                result = m.value;
                resolve(m.value as Awaited<R>);
              } else {
                errored = new Error(m.message ?? "worker error");
                reject(errored);
              }
            });
            w.once("error", (err) => {
              if (settled) return;
              settled = true;
              errored = err;
              reject(err);
            });
            // If the worker exits before sending a result, it was terminated.
            w.once("exit", (code) => {
              if (settled) return;
              settled = true;
              errored = new Error(`worker terminated (exit code ${code})`);
              reject(errored);
            });
          }),
        );
        const exited = job.run();
        ctx.onCleanup(terminate);
        return {
          get running() {
            return job.pending;
          },
          get result() {
            return result;
          },
          get error() {
            return errored;
          },
          exited,
          terminate,
          [Symbol.dispose]: terminate,
        };
      };

      const spawn = (entry: string | URL, opts: WorkerOptions = {}): WorkerInstance => {
        const w = new Worker(entry, opts);
        const handlers = new Set<(message: unknown) => void>();
        w.on("message", (m) => handlers.forEach((h) => h(m)));
        const terminate = (): void => void w.terminate();
        const job = task(host, (signal: AbortSignal) =>
          new Promise<number>((resolve) => {
            signal.addEventListener("abort", terminate, { once: true });
            w.once("exit", (code) => resolve(code));
          }),
        );
        const exited = job.run().then((code) => code ?? -1);
        ctx.onCleanup(terminate);
        return {
          get running() {
            return job.pending;
          },
          postMessage: (message) => w.postMessage(message),
          onMessage: (handler) => {
            handlers.add(handler);
            return () => handlers.delete(handler);
          },
          terminate,
          exited,
          [Symbol.dispose]: terminate,
        };
      };

      contribute(ctx.command, "worker", { run, spawn } as WorkerApi);
    },
  };
}
