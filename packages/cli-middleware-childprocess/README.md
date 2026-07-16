# @youneed/cli-middleware-childprocess

Spawn subprocesses from a [`@youneed/cli`](../cli) command, **wrapped in a
task**. Adds `this.childprocess` with `spawn` (a reactive handle) and `exec`
(await-and-get-output). Because the run is tracked as a `task`, a `render` that
reads it repaints as output streams in, and the runtime **kills the process on
graceful shutdown** (SIGINT/SIGTERM) or when the command tears down — so nothing
is left running.

```ts
import { Command } from "@youneed/cli";
import { childprocess } from "@youneed/cli-middleware-childprocess";

class Build extends Command("build", { middleware: [childprocess()] }) {
  async execute() {
    const tsc = this.childprocess.spawn("tsc", ["-p", "."]);
    const { code } = (await tsc.exited) ?? {};
    if (code !== 0) console.error(tsc.stderr);

    // shell shorthand: run and await the collected output
    const out = await this.childprocess.exec("git rev-parse HEAD");
    console.log(out?.stdout.trim());
  }
}
```

## `this.childprocess`

- **`spawn(command, args?, opts?)`** → `ProcessHandle` — runs a program and
  returns a reactive handle.
- **`exec(command, opts?)`** → `Promise<SpawnResult | undefined>` — runs via the
  shell and resolves with the result.

### `ProcessHandle`

A reactive handle to a running process:

- `pid` — OS process id (once spawned).
- `running` — true while running (backed by the task's `pending`).
- `result` — the `SpawnResult` once exited, else `undefined`.
- `error` — a spawn error (e.g. command not found), if any.
- `stdout` / `stderr` — output collected so far.
- `exited` — `Promise<SpawnResult | undefined>` that resolves when it exits (never rejects).
- `kill(signal?)` — kill now (default the configured `killSignal`).
- `write(chunk)` — write to the process's stdin.
- `[Symbol.dispose]()` — `using p = this.childprocess.spawn(...)` kills on scope exit.

## Options

`SpawnOptions` extends node's [`SpawnOptions`](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options),
plus:

- `killSignal` — signal used by `kill()` / shutdown / teardown. Default `SIGTERM`
  (teardown then hard-stops with `SIGKILL`).

## Exports

- **`childprocess()`** — the middleware. Adds `this.childprocess`.
- Types: `ChildProcessApi`, `ProcessHandle`, `SpawnFn`, `ExecFn`, `SpawnOptions`, `SpawnResult`.
