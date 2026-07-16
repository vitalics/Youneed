# @youneed/server-plugin-cluster

A zero-dependency multi-core **supervisor** over [`node:cluster`](https://nodejs.org/api/cluster.html).
Forks N workers across the available CPUs, **respawns** crashed workers (with a
crash-loop backstop), and on **SIGTERM/SIGINT gracefully drains** every worker
before exiting — for zero-downtime rolling restarts.

Use it two ways: as a `@youneed/server` **plugin** (`cluster()`, wired into the
server's `listen()` lifecycle), or **standalone** (`runCluster()`).

## As a server plugin

The recommended way with `@youneed/server`. The **same module** runs in both the
primary and every worker — register the plugin and the lifecycle does the rest:

```ts
import { Application, Response } from "@youneed/server";
import { cluster } from "@youneed/server-plugin-cluster";

Application()
  .get("/", () => Response.text("ok"))
  .plugin(cluster({ workers: 4 }))     // default: os.availableParallelism() ?? CPU count
  .listen(3000, (s) => s.gracefulShutdown());
```

How it wires into `listen()`:

- **Primary forks** — in the primary, the plugin's `beforeListen` starts a
  `Supervisor` (forking `workers` workers and watching for crashes) and returns
  `false` to **take over**: the server does *not* bind the port in the primary.
- **Worker binds** — each worker re-runs the same module; there the plugin's
  `beforeListen` returns nothing, so the server binds the port normally
  (SO_REUSEPORT / shared handle) and serves traffic.
- **Zero-downtime rolling restart** — on SIGTERM the primary's `onShutdown`
  forwards the signal to every worker and awaits their drain (up to
  `shutdownTimeout`, then SIGKILL for stragglers) **without** exiting the
  process itself; each worker drains its own in-flight requests via its
  `HTTP.gracefulShutdown` and exits. In-flight requests complete; no dropped
  traffic.

`cluster(opts)` accepts every `ClusterOptions` field **except** `run` (the
plugin supplies it internally — workers are just the same server re-binding).

## Standalone — `runCluster`

If you aren't using the `@youneed/server` plugin lifecycle, drive the cluster
directly:

```ts
import { runCluster } from "@youneed/server-plugin-cluster";
import { startServer } from "./server.ts";

runCluster({
  workers: 4,                 // default: os.availableParallelism() ?? CPU count
  run: () => startServer(),   // booted in every worker (not the primary)
});
```

The single `run()` callback is what each **worker** executes. The **primary**
never runs it — it only forks workers and watches them.

## How it composes with the worker's `HTTP.gracefulShutdown`

`@youneed/cluster` is the *primary-side* half of zero-downtime shutdown; the
*worker-side* half is `@youneed/server`'s per-process graceful drain. Wire both:

```ts
// server.ts — runs inside each worker
import { Application, Response } from "@youneed/server";

export function startServer() {
  const app = Application().get("/", () => Response.text("ok"));
  app.listen(3000, (s) =>
    // Drains in-flight requests on SIGTERM/SIGINT, then process.exit(0).
    s.gracefulShutdown({ timeout: 10_000 }),
  );
}
```

The flow on shutdown (e.g. a rolling deploy sends SIGTERM to the primary):

1. The **primary** catches SIGTERM, stops respawning, and forwards `SIGTERM`
   to every live worker (`worker.kill("SIGTERM")`).
2. Each **worker** receives SIGTERM and runs its *own* `HTTP.gracefulShutdown()`
   — it stops accepting connections, drains in-flight requests, then exits 0.
3. The primary waits for every worker to exit, then `process.exit(0)`.

Because each worker drains independently, in-flight requests complete and there
is no dropped traffic.

## Restart / backoff policy

When a worker exits *unexpectedly* (not during shutdown) and `respawn` is on, the
supervisor forks a replacement immediately. To avoid a tight crash loop burning
CPU, it counts restarts within a sliding window:

- `maxRestarts` (default `Infinity`) — restarts allowed within the window.
- `restartWindowMs` (default `60000`) — the sliding window length.

If respawns exceed `maxRestarts` inside `restartWindowMs`, the supervisor **gives
up respawning** and logs a clear crash-loop message — a backstop so a process
that can't even boot doesn't fork forever.

## Forced-kill timeout

On shutdown the primary arms a `shutdownTimeout` timer (default `10000` ms). If
all workers drain and exit before it fires, the timer is cleared and the process
exits `0`. If any worker is still alive when the timer fires, the stragglers get
`SIGKILL`'d and the process exits `1` (a forced, non-clean shutdown).

## API

### `cluster(opts?): ServerPlugin`

The `@youneed/server` plugin. `opts` is `ClusterPluginOptions` — the same as
`ClusterOptions` minus `run` (supplied internally). In the primary its
`beforeListen` starts a `Supervisor` and returns `false` (take over); in a worker
it returns nothing so the server binds. `onShutdown` drives the supervisor's
drain in the primary (a no-op in a worker) — without exiting the process, so the
server's own `gracefulShutdown` owns process exit.

### `runCluster(opts): Promise<void> | void`

The thin entrypoint. In a **worker** it awaits `opts.run()` and returns. In the
**primary** it creates a `Supervisor`, wires `proc.on(signal, …)` for every
configured signal, and starts it.

### `class Supervisor`

The primary-side supervisor, exposed for independent (and unit-testable) use:

- `new Supervisor(opts)` — construct.
- `.start()` — fork the initial workers and watch for exits (idempotent).
- `.shutdown(signal?): Promise<void>` — begin a graceful drain (default
  `"SIGTERM"`); resolves once every worker has exited (clean or forced). With
  `exitOnDrain: false` (the plugin path) it does **not** call `proc.exit`, so the
  caller's own lifecycle owns process exit.
- `.workers` — current live worker count.
- `.shuttingDown` — whether a drain is in progress.

### Options (`ClusterOptions`)

| Option            | Default                                           | Meaning                                                       |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `run`             | —                                                 | Per-process entrypoint, run in every worker.                  |
| `workers`         | `os.availableParallelism?.() ?? os.cpus().length` | Number of workers to fork.                                    |
| `respawn`         | `true`                                            | Respawn workers that exit unexpectedly.                       |
| `maxRestarts`     | `Infinity`                                        | Max respawns within the window (crash-loop backstop).         |
| `restartWindowMs` | `60000`                                           | Sliding window for counting restarts.                         |
| `shutdownTimeout` | `10000`                                           | Grace period before stragglers are `SIGKILL`'d.               |
| `signals`         | `["SIGTERM","SIGINT"]`                             | Signals that trigger a graceful shutdown.                     |
| `cluster`         | `node:cluster` wrapper                             | Injectable {@link ClusterApi} (tests pass a fake).            |
| `proc`            | `process`                                         | Injectable process facade (`on` / `exit` / `kill`).           |
| `setTimer` / `clearTimer` | unref'd `setTimeout` / `clearTimeout`     | Injectable timer (for deterministic tests).                   |
| `log`             | `console.error`                                   | Diagnostic logger.                                            |
| `exitOnDrain`     | `true`                                            | Call `proc.exit()` once drained. The `cluster()` plugin forces `false`. |

### Injectable runtime contracts

```ts
interface WorkerHandle {
  id: number;
  kill(signal?: string): void;
  on(event: "exit", cb: (code: number, signal: string | null) => void): void;
}

interface ClusterApi {
  isPrimary: boolean;
  fork(): WorkerHandle;
  onExit(cb: (worker: WorkerHandle, code: number, signal: string | null) => void): void;
}
```

The default `ClusterApi` (`nodeClusterApi`) wraps `node:cluster`. Everything the
supervisor touches goes through these interfaces, so the whole thing is
unit-testable without ever really forking a process.

## Exports

`cluster`, `runCluster`, `Supervisor`, `nodeClusterApi`, and the types
`ClusterPluginOptions`, `ClusterApi`, `WorkerHandle`, `ProcLike`,
`ClusterOptions`.
