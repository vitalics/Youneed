import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { runCluster, Supervisor, cluster, type ClusterApi, type WorkerHandle, type ProcLike, type ClusterOptions, type ClusterPluginOptions } from "../src/index.ts";

/** A fake worker whose `exit` event we fire manually and whose kills we record. */
class FakeWorker implements WorkerHandle {
  kills: string[] = [];
  exited = false;
  private handlers: Array<(code: number, signal: string | null) => void> = [];
  constructor(public id: number) {}
  kill(signal = "SIGTERM"): void {
    this.kills.push(signal);
  }
  on(_event: "exit", cb: (code: number, signal: string | null) => void): void {
    this.handlers.push(cb);
  }
  /** Simulate the worker process exiting. */
  fireExit(code = 0, signal: string | null = null): void {
    this.exited = true;
    for (const h of this.handlers) h(code, signal);
  }
}

/** A fake primary cluster runtime: records forks, wires the shared exit hook. */
class FakeCluster implements ClusterApi {
  forked: FakeWorker[] = [];
  private nextId = 1;
  private exitCbs: Array<(w: WorkerHandle, code: number, signal: string | null) => void> = [];
  constructor(public isPrimary: boolean = true) {}
  fork(): WorkerHandle {
    const w = new FakeWorker(this.nextId++);
    this.forked.push(w);
    // Bridge the per-handle exit to the cluster-level exit subscribers.
    w.on("exit", (code, signal) => {
      for (const cb of this.exitCbs) cb(w, code, signal);
    });
    return w;
  }
  onExit(cb: (w: WorkerHandle, code: number, signal: string | null) => void): void {
    this.exitCbs.push(cb);
  }
}

/** A fake process facade: records exit codes + captures signal handlers. */
class FakeProc implements ProcLike {
  exitCodes: number[] = [];
  private signalHandlers = new Map<string, Array<() => void>>();
  on(signal: string, cb: () => void): void {
    const list = this.signalHandlers.get(signal) ?? [];
    list.push(cb);
    this.signalHandlers.set(signal, list);
  }
  exit(code: number): void {
    this.exitCodes.push(code);
  }
  /** Fire a registered signal handler. */
  fire(signal: string): void {
    for (const cb of this.signalHandlers.get(signal) ?? []) cb();
  }
}

/** A manually-advanced timer: collects pending callbacks and fires them. */
class FakeTimer {
  private pending: Array<{ cb: () => void; cancelled: boolean }> = [];
  set = (cb: () => void, _ms: number): unknown => {
    const entry = { cb, cancelled: false };
    this.pending.push(entry);
    return entry;
  };
  clear = (handle: unknown): void => {
    const entry = handle as { cancelled: boolean };
    if (entry) entry.cancelled = true;
  };
  /** Fire every armed (not-cancelled) timer. */
  advance(): void {
    const due = this.pending;
    this.pending = [];
    for (const e of due) if (!e.cancelled) e.cb();
  }
}

function makeSupervisor(overrides: Partial<ClusterOptions> = {}) {
  const cluster = new FakeCluster(true);
  const proc = new FakeProc();
  const timer = new FakeTimer();
  const logs: string[] = [];
  const sup = new Supervisor({
    run: () => {},
    cluster,
    proc,
    setTimer: timer.set,
    clearTimer: timer.clear,
    log: (m) => logs.push(m),
    workers: 2,
    ...overrides,
  });
  return { sup, cluster, proc, timer, logs };
}

class ForkSuite extends Test({ name: "cluster: forking" }) {
  @Test.it("primary forks exactly `workers` workers on start")
  forks() {
    const { sup, cluster } = makeSupervisor({ workers: 3 });
    sup.start();
    expect(cluster.forked.length).toBe(3);
    expect(sup.workers).toBe(3);
  }

  @Test.it("start() is idempotent")
  idempotent() {
    const { sup, cluster } = makeSupervisor({ workers: 2 });
    sup.start();
    sup.start();
    expect(cluster.forked.length).toBe(2);
  }
}

class RespawnSuite extends Test({ name: "cluster: respawn" }) {
  @Test.it("respawns an unexpected exit (live count restored)")
  respawns() {
    const { sup, cluster } = makeSupervisor({ workers: 2, respawn: true });
    sup.start();
    expect(sup.workers).toBe(2);
    (cluster.forked[0] as FakeWorker).fireExit(1, null);
    expect(cluster.forked.length).toBe(3); // a replacement was forked
    expect(sup.workers).toBe(2); // live count restored
  }

  @Test.it("does not respawn when respawn=false")
  noRespawn() {
    const { sup, cluster } = makeSupervisor({ workers: 2, respawn: false });
    sup.start();
    (cluster.forked[0] as FakeWorker).fireExit(1, null);
    expect(cluster.forked.length).toBe(2); // no replacement
    expect(sup.workers).toBe(1);
  }

  @Test.it("crash-loop backstop stops respawning past maxRestarts and logs")
  backstop() {
    const { sup, cluster, logs } = makeSupervisor({
      workers: 1,
      respawn: true,
      maxRestarts: 2,
      restartWindowMs: 60_000,
    });
    sup.start();
    expect(cluster.forked.length).toBe(1);
    // Restart 1 (allowed) → fork #2
    (cluster.forked[0] as FakeWorker).fireExit(1, null);
    expect(cluster.forked.length).toBe(2);
    // Restart 2 (allowed) → fork #3
    (cluster.forked[1] as FakeWorker).fireExit(1, null);
    expect(cluster.forked.length).toBe(3);
    // 3rd exit exceeds maxRestarts=2 in window → give up, no new fork
    (cluster.forked[2] as FakeWorker).fireExit(1, null);
    expect(cluster.forked.length).toBe(3); // no further fork
    const sawCrashLoop = logs.some((m) => m.includes("crash-loop"));
    expect(sawCrashLoop).toBe(true);
    // Subsequent exits also do nothing.
    expect(sup.workers).toBe(0);
  }
}

class ShutdownSuite extends Test({ name: "cluster: shutdown" }) {
  @Test.it("shutdown signals every worker and sets shuttingDown")
  signalsAll() {
    const { sup, cluster } = makeSupervisor({ workers: 2 });
    sup.start();
    sup.shutdown("SIGTERM");
    expect(sup.shuttingDown).toBe(true);
    for (const w of cluster.forked) {
      expect((w as FakeWorker).kills).toEqual(["SIGTERM"]);
    }
  }

  @Test.it("no respawn happens once shutting down; proc.exit(0) when all exit")
  drainsThenExits() {
    const { sup, cluster, proc } = makeSupervisor({ workers: 2, respawn: true });
    sup.start();
    sup.shutdown("SIGTERM");
    (cluster.forked[0] as FakeWorker).fireExit(0, "SIGTERM");
    expect(cluster.forked.length).toBe(2); // no respawn during shutdown
    expect(proc.exitCodes).toEqual([]); // not all gone yet
    (cluster.forked[1] as FakeWorker).fireExit(0, "SIGTERM");
    expect(proc.exitCodes).toEqual([0]); // clean exit once empty
  }

  @Test.it("firing SIGTERM on proc drives shutdown (via runCluster wiring)")
  signalWiring() {
    const cluster = new FakeCluster(true);
    const proc = new FakeProc();
    const timer = new FakeTimer();
    runCluster({
      run: () => {},
      cluster,
      proc,
      setTimer: timer.set,
      clearTimer: timer.clear,
      workers: 2,
    });
    expect(cluster.forked.length).toBe(2);
    proc.fire("SIGTERM");
    for (const w of cluster.forked) {
      expect((w as FakeWorker).kills).toEqual(["SIGTERM"]);
    }
    cluster.forked.forEach((w) => (w as FakeWorker).fireExit(0, "SIGTERM"));
    expect(proc.exitCodes).toEqual([0]);
  }

  @Test.it("forced shutdown SIGKILLs stragglers and exits 1 past the timeout")
  forced() {
    const { sup, cluster, proc, timer } = makeSupervisor({ workers: 2, shutdownTimeout: 5_000 });
    sup.start();
    sup.shutdown("SIGTERM");
    // Only the first worker drains; the second hangs.
    (cluster.forked[0] as FakeWorker).fireExit(0, "SIGTERM");
    expect(proc.exitCodes).toEqual([]); // straggler still alive
    timer.advance(); // past shutdownTimeout
    const straggler = cluster.forked[1] as FakeWorker;
    expect(straggler.kills).toEqual(["SIGTERM", "SIGKILL"]);
    expect(proc.exitCodes).toEqual([1]); // forced exit
  }

  @Test.it("clean drain clears the timer (no forced exit fires afterwards)")
  timerCleared() {
    const { sup, cluster, proc, timer } = makeSupervisor({ workers: 1 });
    sup.start();
    sup.shutdown("SIGTERM");
    (cluster.forked[0] as FakeWorker).fireExit(0, "SIGTERM");
    expect(proc.exitCodes).toEqual([0]);
    timer.advance(); // cancelled timer must not fire
    expect(proc.exitCodes).toEqual([0]); // still just the clean exit
  }
}

class WorkerBranchSuite extends Test({ name: "cluster: worker branch" }) {
  @Test.it("runCluster in a worker calls run() and does not fork")
  async runsWorker() {
    const cluster = new FakeCluster(false);
    let ran = false;
    await runCluster({ run: () => { ran = true; }, cluster });
    expect(ran).toBe(true);
    expect(cluster.forked.length).toBe(0);
  }
}

function makePluginFakes(overrides: Partial<ClusterPluginOptions> = {}) {
  const clusterApi = new FakeCluster(true);
  const proc = new FakeProc();
  const timer = new FakeTimer();
  const opts: ClusterPluginOptions = {
    cluster: clusterApi,
    proc,
    setTimer: timer.set,
    clearTimer: timer.clear,
    workers: 4,
    ...overrides,
  };
  return { clusterApi, proc, timer, opts };
}

class PluginPrimarySuite extends Test({ name: "cluster plugin: primary" }) {
  @Test.it("beforeListen takes over (returns false) and forks `workers` workers")
  takesOver() {
    const { clusterApi, opts } = makePluginFakes({ workers: 4 });
    const plugin = cluster(opts);
    const result = plugin.beforeListen!({ port: 3000, opts: {} });
    expect(result).toBe(false);
    expect(clusterApi.forked.length).toBe(4);
  }

  @Test.it("onShutdown signals every worker; clean drain resolves without proc.exit")
  async cleanDrain() {
    const { clusterApi, proc, opts } = makePluginFakes({ workers: 2 });
    const plugin = cluster(opts);
    plugin.beforeListen!({ port: 3000, opts: {} });
    const done = plugin.onShutdown!();
    // Each worker received the shutdown signal.
    for (const w of clusterApi.forked) {
      expect((w as FakeWorker).kills).toEqual(["SIGTERM"]);
    }
    // Workers drain → the onShutdown promise resolves.
    clusterApi.forked.forEach((w) => (w as FakeWorker).fireExit(0, "SIGTERM"));
    await done;
    // The supervisor must NOT exit the process on the plugin path.
    expect(proc.exitCodes).toEqual([]);
  }

  @Test.it("onShutdown force path SIGKILLs stragglers (no proc.exit on plugin path)")
  async forceDrain() {
    const { clusterApi, proc, timer, opts } = makePluginFakes({ workers: 2, shutdownTimeout: 5_000 });
    const plugin = cluster(opts);
    plugin.beforeListen!({ port: 3000, opts: {} });
    const done = plugin.onShutdown!();
    // First worker drains, second hangs.
    (clusterApi.forked[0] as FakeWorker).fireExit(0, "SIGTERM");
    timer.advance(); // past shutdownTimeout → force the straggler
    const straggler = clusterApi.forked[1] as FakeWorker;
    expect(straggler.kills).toEqual(["SIGTERM", "SIGKILL"]);
    await done;
    expect(proc.exitCodes).toEqual([]); // server drain owns exit, not the supervisor
  }
}

class PluginWorkerSuite extends Test({ name: "cluster plugin: worker" }) {
  @Test.it("beforeListen returns falsy non-false in a worker and forks nothing")
  bindsNormally() {
    const clusterApi = new FakeCluster(false);
    const plugin = cluster({ cluster: clusterApi, workers: 4 });
    const result = plugin.beforeListen!({ port: 3000, opts: {} });
    // Falsy but NOT `false` → the server binds the port normally.
    expect(result).toBeFalsy();
    expect(result === false).toBe(false);
    expect(clusterApi.forked.length).toBe(0);
  }

  @Test.it("onShutdown is a no-op in a worker")
  async shutdownNoop() {
    const clusterApi = new FakeCluster(false);
    const plugin = cluster({ cluster: clusterApi, workers: 4 });
    plugin.beforeListen!({ port: 3000, opts: {} });
    await plugin.onShutdown!();
    expect(clusterApi.forked.length).toBe(0);
  }
}

await TestApplication()
  .addTests(ForkSuite)
  .addTests(RespawnSuite)
  .addTests(ShutdownSuite)
  .addTests(WorkerBranchSuite)
  .addTests(PluginPrimarySuite)
  .addTests(PluginWorkerSuite)
  .reporter(new ConsoleReporter())
  .run();
