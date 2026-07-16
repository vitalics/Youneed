/**
 * @youneed/cluster — a zero-dependency multi-core supervisor over `node:cluster`.
 *
 * Forks N workers across the available CPUs, respawns crashed workers (with a
 * crash-loop backstop), and on SIGTERM/SIGINT gracefully drains every worker
 * before exiting.
 *
 * The supervisor only ever runs in the cluster **primary**. A **worker** simply
 * runs your `run()` callback — which typically boots an `@youneed/server` HTTP
 * server and installs `HTTP.gracefulShutdown()`. When the primary forwards a
 * signal to a worker, the worker drains its own in-flight requests and exits;
 * the primary waits for every worker to go, giving zero-downtime restarts.
 */

import nodeCluster from "node:cluster";
import os from "node:os";
import type { ServerPlugin } from "@youneed/server";

/** A minimal, injectable view of a single cluster worker. */
export interface WorkerHandle {
  /** Stable per-worker id (the `cluster.Worker.id`). */
  id: number;
  /** Send a signal to the worker process (default `"SIGTERM"`). */
  kill(signal?: string): void;
  /** Subscribe to the worker's `"exit"` event. */
  on(event: "exit", cb: (code: number, signal: string | null) => void): void;
}

/**
 * The cluster runtime the {@link Supervisor} drives. The default wraps
 * `node:cluster`; tests inject a fake so the supervisor is unit-testable
 * without really forking.
 */
export interface ClusterApi {
  /** Whether this process is the cluster primary. */
  isPrimary: boolean;
  /** Fork a new worker and return a handle to it. */
  fork(): WorkerHandle;
  /** Subscribe to any worker's exit (i.e. `cluster.on("exit", …)`). */
  onExit(cb: (worker: WorkerHandle, code: number, signal: string | null) => void): void;
}

/** Minimal process facade — injectable so signal/exit can be faked in tests. */
export interface ProcLike {
  on(signal: string, cb: () => void): void;
  exit(code: number): void;
  kill?(pid: number, signal: string): void;
}

/** Options for {@link runCluster} / {@link Supervisor}. */
export interface ClusterOptions {
  /** The per-process entrypoint, run in every worker (not the primary). */
  run: () => unknown | Promise<unknown>;
  /** How many workers to fork (default: available parallelism / CPU count). */
  workers?: number;
  /** Respawn workers that exit unexpectedly (default `true`). */
  respawn?: boolean;
  /**
   * Max respawns allowed within {@link restartWindowMs} before the supervisor
   * gives up (crash-loop backstop). Default `Infinity`.
   */
  maxRestarts?: number;
  /** Sliding window (ms) for counting restarts (default `60000`). */
  restartWindowMs?: number;
  /**
   * Grace period (ms) to wait for workers to drain on shutdown before they're
   * force-killed with SIGKILL (default `10000`).
   */
  shutdownTimeout?: number;
  /** Signals that trigger a graceful shutdown (default `["SIGTERM","SIGINT"]`). */
  signals?: string[];
  /** The cluster runtime (default: a `node:cluster` wrapper). */
  cluster?: ClusterApi;
  /** The process facade (default: `process`). */
  proc?: ProcLike;
  /** Timer factory (default: an unref'd `setTimeout`). */
  setTimer?: (cb: () => void, ms: number) => unknown;
  /** Timer canceller (default: `clearTimeout`). */
  clearTimer?: (handle: unknown) => void;
  /** Diagnostic logger (default: `console.error`). */
  log?: (msg: string) => void;
  /**
   * Whether the supervisor calls `proc.exit()` once every worker has drained
   * (or the force timeout fires). Default `true` — the standalone `runCluster`
   * owns process exit. The {@link cluster} server plugin sets this `false` so
   * the server's own graceful drain controls when the primary process exits.
   */
  exitOnDrain?: boolean;
}

/** Adapt a real `node:cluster` Worker to the {@link WorkerHandle} shape. */
function adaptWorker(worker: import("node:cluster").Worker): WorkerHandle {
  return {
    id: worker.id,
    kill: (signal?: string) => worker.kill(signal),
    on: (event, cb) => {
      worker.on(event, (code: number, signal: string | null) => cb(code, signal));
    },
  };
}

/** The default {@link ClusterApi}, wrapping `node:cluster`. */
export const nodeClusterApi: ClusterApi = {
  get isPrimary() {
    return nodeCluster.isPrimary;
  },
  fork: () => adaptWorker(nodeCluster.fork()),
  onExit: (cb) => {
    nodeCluster.on("exit", (worker, code, signal) => cb(adaptWorker(worker), code, signal));
  },
};

function defaultWorkers(): number {
  const avail = (os as { availableParallelism?: () => number }).availableParallelism;
  return (avail ? avail() : undefined) ?? os.cpus().length ?? 1;
}

/**
 * The primary-side supervisor. Forks and tracks workers, respawns crashes
 * within a sliding window, and drains everything on shutdown.
 *
 * Usually you don't construct this directly — {@link runCluster} does — but it's
 * exposed so it can be driven (and unit-tested) on its own.
 */
export class Supervisor {
  private readonly api: ClusterApi;
  private readonly proc: ProcLike;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly log: (msg: string) => void;

  private readonly workerCount: number;
  private readonly respawn: boolean;
  private readonly maxRestarts: number;
  private readonly restartWindowMs: number;
  private readonly shutdownTimeout: number;
  private readonly signals: string[];
  private readonly exitOnDrain: boolean;

  private readonly live = new Map<number, WorkerHandle>();
  private restartTimes: number[] = [];
  private giveUpRespawn = false;
  private shutdownTimer: unknown = undefined;
  private started = false;
  /** Resolved once every worker has exited (and the force timer is cleared). */
  private drained: Promise<void> | undefined;
  private resolveDrained: (() => void) | undefined;

  /** Whether a graceful shutdown is in progress. */
  shuttingDown = false;

  constructor(opts: ClusterOptions) {
    this.api = opts.cluster ?? nodeClusterApi;
    this.proc = opts.proc ?? (process as unknown as ProcLike);
    this.setTimer =
      opts.setTimer ??
      ((cb, ms) => {
        const t = setTimeout(cb, ms);
        (t as { unref?: () => void }).unref?.();
        return t;
      });
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.log = opts.log ?? ((msg) => console.error(msg));

    this.workerCount = opts.workers ?? defaultWorkers();
    this.respawn = opts.respawn ?? true;
    this.maxRestarts = opts.maxRestarts ?? Infinity;
    this.restartWindowMs = opts.restartWindowMs ?? 60_000;
    this.shutdownTimeout = opts.shutdownTimeout ?? 10_000;
    this.signals = opts.signals ?? ["SIGTERM", "SIGINT"];
    this.exitOnDrain = opts.exitOnDrain ?? true;
  }

  /** Number of live (forked, not-yet-exited) workers. */
  get workers(): number {
    return this.live.size;
  }

  /** The signals this supervisor shuts down on. */
  get watchedSignals(): readonly string[] {
    return this.signals;
  }

  /** Fork the initial set of workers and begin watching for exits. */
  start(): this {
    if (this.started) return this;
    this.started = true;
    this.api.onExit((worker, code, signal) => this.onWorkerExit(worker, code, signal));
    for (let i = 0; i < this.workerCount; i++) this.forkOne();
    return this;
  }

  private forkOne(): void {
    const worker = this.api.fork();
    this.live.set(worker.id, worker);
    // Track per-handle exit too, in case the runtime reports exit that way.
    worker.on("exit", (code, signal) => this.onWorkerExit(worker, code, signal));
  }

  private onWorkerExit(worker: WorkerHandle, code: number, signal: string | null): void {
    // Drop the worker if we still know about it; ignore duplicate exit reports
    // (both `cluster.on("exit")` and `worker.on("exit")` may fire).
    if (!this.live.has(worker.id)) return;
    this.live.delete(worker.id);

    if (this.shuttingDown) {
      if (this.live.size === 0) {
        this.clearShutdownTimer();
        this.resolveDrained?.();
        if (this.exitOnDrain) this.proc.exit(0);
      }
      return;
    }

    if (!this.respawn || this.giveUpRespawn) return;

    if (!this.allowRestart()) {
      this.giveUpRespawn = true;
      this.log(
        `[cluster] crash-loop detected: more than ${this.maxRestarts} restarts within ${this.restartWindowMs}ms — giving up respawning (worker exited code=${code} signal=${signal})`,
      );
      return;
    }

    this.log(`[cluster] worker ${worker.id} exited (code=${code} signal=${signal}); respawning`);
    this.forkOne();
  }

  /** Record a restart and report whether it stays within the window budget. */
  private allowRestart(): boolean {
    if (this.maxRestarts === Infinity) return true;
    const now = Date.now();
    const cutoff = now - this.restartWindowMs;
    this.restartTimes = this.restartTimes.filter((t) => t > cutoff);
    if (this.restartTimes.length >= this.maxRestarts) return false;
    this.restartTimes.push(now);
    return true;
  }

  /**
   * Begin a graceful shutdown: stop respawning, forward `signal` to every live
   * worker (so each runs its own graceful drain), and arm the force-kill timer.
   * When all workers exit first, the timer is cleared and the process exits 0
   * (unless {@link ClusterOptions.exitOnDrain} is `false`, e.g. the server
   * plugin path, where the server's own drain owns process exit).
   *
   * Returns a promise that resolves once every worker has exited (clean or
   * forced) — so a caller (the plugin) can `await supervisor.shutdown()` and
   * then let its own lifecycle decide when to exit.
   */
  shutdown(signal = "SIGTERM"): Promise<void> {
    if (this.shuttingDown) return this.drained ?? Promise.resolve();
    this.shuttingDown = true;

    let resolve!: () => void;
    this.drained = new Promise<void>((r) => {
      resolve = r;
    });
    this.resolveDrained = resolve;

    if (this.live.size === 0) {
      resolve();
      if (this.exitOnDrain) this.proc.exit(0);
      return this.drained;
    }

    for (const worker of this.live.values()) worker.kill(signal);

    this.shutdownTimer = this.setTimer(() => {
      for (const worker of this.live.values()) {
        this.log(`[cluster] worker ${worker.id} did not drain within ${this.shutdownTimeout}ms; SIGKILL`);
        worker.kill("SIGKILL");
      }
      this.live.clear();
      this.resolveDrained?.();
      if (this.exitOnDrain) this.proc.exit(1);
    }, this.shutdownTimeout);

    return this.drained;
  }

  private clearShutdownTimer(): void {
    if (this.shutdownTimer !== undefined) {
      this.clearTimer(this.shutdownTimer);
      this.shutdownTimer = undefined;
    }
  }
}

/**
 * Run the application across multiple CPU cores.
 *
 * In a **worker** process this just awaits `opts.run()` (boot your server +
 * `HTTP.gracefulShutdown()` there). In the **primary** it forks a pool of
 * workers, respawns crashes, and installs signal handlers that gracefully drain
 * every worker on SIGTERM/SIGINT.
 *
 * @example
 * runCluster({ workers: 4, run: () => startServer() });
 */
export function runCluster(opts: ClusterOptions): Promise<void> | void {
  const api = opts.cluster ?? nodeClusterApi;

  if (!api.isPrimary) {
    // Worker: run the app and return (its own gracefulShutdown handles signals).
    return Promise.resolve(opts.run()).then(() => undefined);
  }

  const supervisor = new Supervisor(opts);
  const proc = opts.proc ?? (process as unknown as ProcLike);
  for (const signal of supervisor.watchedSignals) {
    proc.on(signal, () => supervisor.shutdown(signal));
  }
  supervisor.start();
}

/**
 * Options for the {@link cluster} server plugin — the same as
 * {@link ClusterOptions} but **without** `run`: the plugin supplies `run`
 * internally (each worker is simply the same server process re-binding the
 * port), and forces `exitOnDrain: false` so the server's own graceful drain
 * owns when the primary exits.
 */
export type ClusterPluginOptions = Omit<ClusterOptions, "run" | "exitOnDrain">;

/**
 * A `@youneed/server` plugin that clusters the app across CPU cores via its
 * `listen()` lifecycle.
 *
 * In the **primary**, `beforeListen` starts a {@link Supervisor} (forking
 * `workers` workers and watching for crashes) and returns `false` so the server
 * does **not** bind in the primary — it takes over. `onShutdown` then drives the
 * supervisor's graceful drain (forwarding the signal to every worker, waiting up
 * to `shutdownTimeout`, SIGKILL'ing stragglers) without exiting the process
 * itself — the server's own `gracefulShutdown` controls process exit.
 *
 * In a **worker**, `beforeListen` returns nothing, so the server binds the port
 * normally (SO_REUSEPORT / shared handle). Each worker re-runs the same code and
 * drains its own in-flight requests on SIGTERM via its `HTTP.gracefulShutdown`,
 * giving zero-downtime rolling restarts.
 *
 * @example
 * // The SAME module runs in both the primary and every worker.
 * Application()
 *   .get("/", () => Response.text("ok"))
 *   .plugin(cluster({ workers: 4 }))
 *   .listen(3000, (s) => s.gracefulShutdown());
 */
export function cluster(opts: ClusterPluginOptions = {}): ServerPlugin {
  const api = opts.cluster ?? nodeClusterApi;
  let supervisor: Supervisor | undefined;

  return {
    name: "@youneed/server-plugin-cluster",
    beforeListen() {
      // Worker: let the server bind the port and drain itself on shutdown.
      if (!api.isPrimary) return undefined;

      // Primary: fork + supervise workers, and TAKE OVER (don't bind here).
      supervisor = new Supervisor({
        ...opts,
        // The worker re-runs this same module; the supervisor never calls run().
        run: () => undefined,
        // The server's own drain owns process exit, not the supervisor.
        exitOnDrain: false,
      });
      supervisor.start();
      return false;
    },
    async onShutdown() {
      // Worker: no-op — the worker's own server drain handles it.
      // Primary: forward the signal to workers and await their drain.
      await supervisor?.shutdown();
    },
  };
}
