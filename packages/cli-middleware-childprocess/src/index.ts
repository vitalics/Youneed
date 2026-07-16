// @youneed/cli-middleware-childprocess — spawn subprocesses, wrapped in a task.
//
//   class Build extends Command("build", { middleware: [childprocess()] }) {
//     async execute() {
//       const tsc = this.childprocess.spawn("tsc", ["-p", "."]);
//       const { code } = await tsc.exited;
//       if (code !== 0) console.error(tsc.stderr);
//     }
//   }
//
// `this.childprocess.spawn` runs a program and returns a reactive handle:
// `running`, `stdout`/`stderr`, `result`, and an `exited` promise — the
// underlying run is a `task`, so a `render` that reads it repaints as output
// streams in, and the runtime KILLS the process on graceful shutdown
// (SIGINT/SIGTERM) or when the command tears down. `kill()` stops it instantly.
// `this.childprocess.exec` is the await-and-get-output shorthand. (It's grouped
// under `this.childprocess` to keep the command's `this` uncluttered.)

import { spawn as nodeSpawn, type SpawnOptions as NodeSpawnOptions } from "node:child_process";
import { contribute, task, type CliMiddleware, type ReactiveHost } from "@youneed/cli";

/** Options for {@link SpawnFn}/{@link ExecFn} — node's plus a kill signal. */
export interface SpawnOptions extends NodeSpawnOptions {
  /** Signal used by `kill()` / shutdown / teardown. Default `SIGTERM`. */
  killSignal?: NodeJS.Signals;
}

/** The outcome of a finished process. */
export interface SpawnResult {
  /** Exit code, or `null` if it was killed by a signal. */
  code: number | null;
  /** Signal that killed it, or `null`. */
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** A reactive handle to a running process. */
export interface ProcessHandle {
  /** OS process id (once spawned). */
  readonly pid?: number;
  /** True while the process is running. */
  readonly running: boolean;
  /** The result once it has exited, else `undefined`. */
  readonly result?: SpawnResult;
  /** A spawn error (e.g. command not found), if any. */
  readonly error?: unknown;
  /** stdout collected so far. */
  readonly stdout: string;
  /** stderr collected so far. */
  readonly stderr: string;
  /** Resolves with the result when the process exits (never rejects). */
  readonly exited: Promise<SpawnResult | undefined>;
  /** Kill the process now (default the configured `killSignal`). */
  kill(signal?: NodeJS.Signals): void;
  /** Write to the process's stdin. */
  write(chunk: string): void;
  /** `using p = this.spawn(...)` kills on scope exit. */
  [Symbol.dispose](): void;
}

/** `this.spawn(command, args?, opts?)`. */
export type SpawnFn = (command: string, args?: readonly string[], opts?: SpawnOptions) => ProcessHandle;
/** `this.exec(command, opts?)` — run via the shell and await the result. */
export type ExecFn = (command: string, opts?: SpawnOptions) => Promise<SpawnResult | undefined>;

/** The `this.childprocess` surface contributed by {@link childprocess}. */
export interface ChildProcessApi {
  spawn: SpawnFn;
  exec: ExecFn;
}

/**
 * Child-process middleware. Adds `this.childprocess` with `spawn` (reactive
 * handle) and `exec` (await output) — namespaced to keep `this` uncluttered.
 * Every spawned process is bound to the command: it is killed on graceful
 * shutdown and on teardown, so nothing is left running.
 */
export function childprocess(): CliMiddleware<{ readonly childprocess: ChildProcessApi }> {
  return {
    name: "childprocess",
    install(ctx) {
      const host = ctx.command as unknown as ReactiveHost;

      const spawn: SpawnFn = (command, args = [], opts = {}) => {
        const { killSignal = "SIGTERM", ...nodeOpts } = opts;
        const child = nodeSpawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"], ...nodeOpts });

        let stdout = "";
        let stderr = "";
        let result: SpawnResult | undefined;
        let errored: unknown;
        child.stdout?.on("data", (d: Buffer) => {
          stdout += d;
          host.requestUpdate();
        });
        child.stderr?.on("data", (d: Buffer) => {
          stderr += d;
          host.requestUpdate();
        });

        const kill = (signal: NodeJS.Signals = killSignal): void => {
          try {
            if (child.exitCode === null && child.signalCode === null) child.kill(signal);
          } catch {
            /* already gone */
          }
        };

        // The lifetime is a task: tracked by the host (the live loop waits for
        // it; shutdown aborts it → kills the child), pending while running.
        const run = task(host, (signal: AbortSignal) =>
          new Promise<SpawnResult>((resolve, reject) => {
            signal.addEventListener("abort", () => kill(killSignal), { once: true });
            child.once("error", (err) => {
              errored = err;
              reject(err);
            });
            child.once("close", (code, sig) => {
              result = { code, signal: sig, stdout, stderr };
              resolve(result);
            });
          }),
        );

        const exited = run.run();
        // Hard-stop anything still alive when the command ends.
        ctx.onCleanup(() => kill("SIGKILL"));

        return {
          get pid() {
            return child.pid;
          },
          get running() {
            return run.pending;
          },
          get result() {
            return result;
          },
          get error() {
            return errored;
          },
          get stdout() {
            return stdout;
          },
          get stderr() {
            return stderr;
          },
          exited,
          kill,
          write: (chunk) => void child.stdin?.write(chunk),
          [Symbol.dispose]: () => kill(),
        };
      };

      const exec: ExecFn = (command, opts = {}) => spawn(command, [], { ...opts, shell: true }).exited;

      contribute(ctx.command, "childprocess", { spawn, exec });
    },
  };
}
