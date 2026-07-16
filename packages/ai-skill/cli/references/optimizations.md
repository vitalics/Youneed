# @youneed/cli — Performance & Startup Cost

A CLI's perceived speed is dominated by **startup** (work done before the command
runs) and **redraw cost** (how much a live region rewrites). Diagnose which one,
then apply the matching fix. Source: `packages/cli/src/{live,scheduler,task}.ts`
plus the cache/worker package READMEs.

## Startup cost

- **`Application(config)` runs immediately.** Keep top-level module work tiny:
  don't import heavy deps (a markdown renderer, a notifier) at the top of the
  entry — import them where used, or behind a command.
- **Lazy plugin / middleware loading.** A plugin or middleware only costs what its
  factory imports. Import a middleware module **inside** the command file that
  uses it, not in a shared barrel that every command pulls in. App plugins
  (`plugins: [...]`) see the whole catalogue — only attach the ones a run needs;
  a `setup(host)` that calls `addCommand` adds a command without importing its
  body until dispatch.
- **Defer expensive validation to install time, not import time.** `env({...})`
  and option `schema:` validation run when the matched command installs — so an
  unrelated command pays nothing.

## Memoise across invocations — `cli-middleware-cache`

A CLI is re-launched constantly; cache expensive results on disk so the second
run is instant.

```ts
import { cache } from "@youneed/cli-middleware-cache";
class Build extends Command("build", { middleware: [cache()] }) {
  async execute() {
    const deps = await this.cache.wrap("deps", () => resolveDeps(), 60_000); // get-or-compute, 60s TTL
  }
}
```

`wrap(key, factory, ttlMs?)` is the get-or-compute path; keys are SHA-1 hashed for
the filename; an expired entry is deleted on read. `namespace` (default the program
name) isolates apps. Use it for dependency resolution, network lookups, compiled output.

## Offload CPU work — `cli-middleware-worker`

Keep the main thread (and the live region) responsive by moving CPU-bound work to
a worker thread.

```ts
import { worker } from "@youneed/cli-middleware-worker";
const job = this.worker.run((data, require) => heavyCompute(data), input);
await job.exited;   // reactive: render() can show job.running meanwhile
```

`run` is a `task`, so `render()` repaints as it progresses; the thread is
terminated on shutdown. See [`security.md`](security.md) for the closure caveat.

## The redraw scheduler — avoid redundant repaints

`LiveRenderer.draw` already minimises terminal writes: it diffs against the
previous frame and **rewrites only changed rows** (cursor-up + clear-line),
stepping past intact lines. So cheap redraws are fine — but:

- **Coalesce updates.** `requestUpdate()` / `scheduler.requestUpdate()` request a
  *coalesced* repaint; a burst of state changes in one tick yields one draw. Don't
  call `LiveRenderer.draw` yourself in a tight loop.
- **Pick the right cadence.** `scheduler.frame(tick, fps)` and
  `scheduler.every(intervalMs, tick)` set independent rates per element (12fps
  spectrum, 1s clock, 80ms spinner). Lower the fps for slow-changing UIs — every
  frame is a diff+write. Timers are `unref`'d (never keep the process alive) and
  disposed when the command ends.
- **Keep template identity stable.** Return the same `text`/`table` shape each
  render so only the holes change; rebuilding the whole string forces every line
  to differ and repaint. Move expensive per-render computation out of `render()`.
- **`task.run()` aborts the prior run.** Re-running a `task` cancels the previous
  fetch/op via its `signal` — no piled-up redundant work racing to repaint.

## When asked "why is my CLI slow?"

1. Separate **startup** (time-to-first-output) from **redraw** (jank during a live
   region). Measure with `time mycli --help` for startup.
2. Startup → trim top-level imports, lazy-load middleware/plugins, add `cache()`.
3. Redraw → lower `scheduler` fps, coalesce via `requestUpdate()`, stabilise
   template identity, offload CPU work to `worker`.
4. Re-measure and report the delta, not "should be faster".
