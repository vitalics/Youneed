# @youneed/cli — Input Validation & Process Safety

Treat every external input — flags, env, argv, clipboard — as untrusted, and run
subprocesses without a shell where possible. Source: each package README plus
`packages/cli/src/{option,parse}.ts`.

## Validate flags at the boundary

The flag string types each option; refine and **validate** so bad input fails
before `execute`, not deep inside it.

```ts
import { option, t } from "@youneed/cli";

option("--port <p>", { schema: t.number() });    // validate via @youneed/schema (Standard Schema)
option("--max <n>", { type: Number });            // coerce to number
option("--token <t>", { required: true });        // gate: errors if absent
```

`t` (and `Infer`) are re-exported from `@youneed/cli` (originally `@youneed/schema`).
Any Standard Schema (zod/valibot) works in `schema:`. Prefer a `schema:` with a
tight shape (enum, range, regex) over accepting a raw string you later parse.

## Validate the environment — `cli-middleware-env`

```ts
import { env, t } from "@youneed/cli-middleware-env";

class Serve extends Command({
  name: "serve",
  middleware: [env({ PORT: t.port().default(3000), NODE_ENV: t.enum(["dev", "prod"]) })],
}) {
  execute() { this.server.listen(this.env.PORT); } // this.env.PORT: number, NODE_ENV: "dev"|"prod"
}
```

Parsing runs at **install time** (before `execute`) and throws listing **every**
problem at once, so a misconfigured environment never reaches command logic. Pass
`{ source }` (a plain object) for tests instead of `process.env`.

## Spawn subprocesses safely — `cli-middleware-childprocess`

Prefer `spawn(command, args[])` (no shell — args are passed literally, immune to
shell injection) over `exec(commandLine)` (runs **via the shell**). Only use
`exec` with a fully trusted, constant command line — never interpolate user input
into it.

```ts
import { childprocess } from "@youneed/cli-middleware-childprocess";

class Build extends Command("build", { middleware: [childprocess()] }) {
  async execute(ref: string) {
    // SAFE: ref is a literal argv element, never reinterpreted by a shell.
    const p = this.childprocess.spawn("git", ["rev-parse", ref]);
    const { code } = (await p.exited) ?? {};
    if (code !== 0) console.error(p.stderr);
    // AVOID with untrusted input: this.childprocess.exec(`git rev-parse ${ref}`)  ← shell injection
  }
}
```

`spawn` returns a reactive `ProcessHandle` (`pid`/`running`/`result`/`error`/
`stdout`/`stderr`/`exited`/`kill(signal?)`/`write(chunk)`/`[Symbol.dispose]`). The
run is a `task`, so the runtime **kills it on graceful shutdown** (SIGINT/SIGTERM)
or teardown — nothing is left running. `killSignal` (default `SIGTERM`, then hard
`SIGKILL` on teardown) is configurable. `using p = this.childprocess.spawn(...)`
kills on scope exit.

## Offload untrusted/heavy work — `cli-middleware-worker`

```ts
import { worker } from "@youneed/cli-middleware-worker";
const job = this.worker.run((path, require) => {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(require("node:fs").readFileSync(path)).digest("hex");
}, file);                          // fn is shipped by source: no closures; inputs via data
await job.exited;                  // never rejects (undefined on error)
```

`fn(data, require)` runs on a `node:worker_threads` thread; `data`/result must be
structured-cloneable. The thread is **terminated on shutdown/teardown**. Isolates
CPU-heavy or risky parsing off the main thread.

## Temp files that never leak — `cli-middleware-fs`

```ts
import { fs } from "@youneed/cli-middleware-fs";
const dir = this.fs.tempDir();            // removed automatically on teardown
this.fs.writeJson(`${dir}/out.json`, { ok: true });
```

`tempDir(prefix?)`/`tempFile(name?)` are auto-removed on teardown — use them for
secrets/scratch instead of writing predictable paths in cwd. Writes create parent
dirs; `remove` is recursive+force.

## Secrets & clipboard — `cli-middleware-clipboard`

```ts
import { clipboard } from "@youneed/cli-middleware-clipboard";
await this.clipboard.write(token);        // pbcopy/xclip/clip; best-effort
```

Prefer copying a generated token to the clipboard over printing it (it won't sit
in scrollback or logs). `read()` returns `""` if no tool is available; calls never
throw. Don't echo secrets through `console.log`; don't put them in argv (visible
in `ps`) — read them from `this.env` instead.

## Checklist

- Validate every flag with `type`/`schema`/`required`; validate env with `env({...})`.
- `spawn(cmd, args[])` for anything with user input; reserve `exec` for constants.
- Never string-interpolate untrusted input into an `exec`/shell command.
- Keep secrets in env (not argv), write them to auto-removed temp files, never log them.
