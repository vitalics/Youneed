# @youneed/logger-plugin-exception

Winston-style exception handlers for [`@youneed/logger`](../logger) — logs
`uncaughtException` / `unhandledRejection` and (by default) flushes and exits.

Process-level handlers are Node-only, so this ships as a logger **plugin**
package rather than part of the universal core.

```ts
import { createLogger } from "@youneed/logger";
import { exceptionHandler } from "@youneed/logger-plugin-exception";

const log = createLogger({ plugins: [exceptionHandler()] });
// later: throw new Error("boom") anywhere →
// { level: "error", message: "uncaughtException", exception: true,
//   error: { name, message, stack } }  then process exits 1
```

## Options

| option | default | meaning |
|---|---|---|
| `level` | `"error"` | level for the logged record |
| `handleExceptions` | `true` | listen for `uncaughtException` |
| `handleRejections` | `true` | listen for `unhandledRejection` |
| `exitOnError` | `true` | exit after logging; pass `false` or a `(err) => boolean` predicate |
| `exitCode` | `1` | exit code |
| `flushTimeout` | `3000` | max ms to wait for `logger.close()` before forcing the exit |

`logger.close()` removes the process listeners (the plugin returns a disposable),
so `await using log = createLogger({ plugins: [exceptionHandler()] })` cleans up.

## Build

```sh
pnpm --filter @youneed/logger-plugin-exception run build
```
