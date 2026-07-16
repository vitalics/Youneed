# @youneed/cli-middleware-worker

Worker-thread offloading for [`@youneed/cli`](../cli). The middleware adds
**`this.worker`** with `run` (one-shot offload) and `spawn` (a persistent worker
module), both wrapping `node:worker_threads`. `this.worker.run(fn, data)` runs
`fn(data, require)` on a worker thread and returns a **reactive** handle
(`running`/`result`/`error`/`exited`) — the run is a `task`, so `render()`
repaints as it progresses, and the runtime **terminates** the thread on graceful
shutdown (SIGINT/SIGTERM) or teardown. `fn` is shipped by source, so keep it
self-contained: no closures — pass inputs via `data` and load modules via the
injected `require`.

```ts
import { Application, Command } from "@youneed/cli";
import { worker } from "@youneed/cli-middleware-worker";

class Hash extends Command("hash <file>", { middleware: [worker()] }) {
  async execute(file: string) {
    const job = this.worker.run((path, require) => {
      const { readFileSync } = require("node:fs");
      const { createHash } = require("node:crypto");
      return createHash("sha256").update(readFileSync(path)).digest("hex");
    }, file);
    console.log(await job.exited); // resolves with the digest (undefined on error)
  }
}

const app = Application({ name: "tool", commands: [Hash] });
app.run(["hash", "./package.json"]);
```

## Exports

- **`worker()`** — middleware. Contributes `this.worker`, a `WorkerApi`.

## API

- **`WorkerApi`**
  - `run(fn, data?)` → `WorkerHandle<R>` — runs `fn(data, require)` on a worker
    thread. `data` and the result must be structured-cloneable.
  - `spawn(entry, opts?)` → `WorkerInstance` — runs a worker module (file or URL)
    for message-passing / persistent work.
- **`WorkerHandle<T>`** — `{ running, result?, error?, exited, terminate() }`.
  `exited` resolves with the result and never rejects (`undefined` on error);
  `using h = this.worker.run(...)` terminates on scope exit (`Symbol.dispose`).
- **`WorkerInstance`** — `{ running, postMessage(msg), onMessage(handler),
  terminate(), exited }`. `onMessage` returns an unsubscribe; `exited` resolves
  with the worker's exit code. Also `Symbol.dispose`.
