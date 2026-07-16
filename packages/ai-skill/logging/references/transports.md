# @youneed/logger — Transports

Plug into a logger via `transports: [...]` or `log.add(t)`. Each accepts the common
`{ level?, format? }` options plus its own. Per-transport `level`/`format` override the
logger's for that sink.

## stdout — `@youneed/logger-transport-stdout` (Node)

Fast `process.stdout`/`stderr` writer (bypasses `console`). Source: package `src/index.ts`.

```ts
import { StdoutTransport, stdout } from "@youneed/logger-transport-stdout";
new StdoutTransport({ stderrLevels: ["error", "warn"] });  // default stderrLevels
// error/warn → stderr; info/debug/verbose/silly/http → stdout
```

Prefer this over `ConsoleTransport` for production Node services.

## file — `@youneed/logger-transport-file` (Node)

Append to a file. Source: package `src/index.ts`.

```ts
import { FileTransport, file } from "@youneed/logger-transport-file";
new FileTransport({ filename: "logs/app.log" });                 // sync (appendFileSync), crash-safe
new FileTransport({ filename: "logs/app.log", stream: true });   // buffered WriteStream, faster under load
```

`stream: true` is non-blocking but **must** be flushed: call `await transport.close()` on
shutdown (or `await using`). Sync mode writes each record before returning.

## http — `@youneed/logger-transport-http` (universal)

Batch-ship logs over HTTP. Works in browser and Node. Source: package `src/index.ts`.

```ts
import { HttpTransport, http } from "@youneed/logger-transport-http";
new HttpTransport({
  url: "/api/logs",
  batchSize: 20,          // default — flush when buffer reaches this
  flushInterval: 2000,    // default ms — or flush on this timer
  headers: { authorization: `Bearer ${token}` },
  useBeacon: true,        // default — navigator.sendBeacon on pagehide (survives nav)
  transform: (info) => info,           // default: rendered string
  serialize: (batch) => JSON.stringify(batch),
  fetch: customFetch,                  // override fetch impl
  onError: (err) => {/* swallow by default so logging never crashes the app */},
});
```

Flushes when `buffer ≥ batchSize` **or** `flushInterval` elapses; POSTs a JSON array.
Network errors are swallowed (surfaced only via `onError`). On browser unload it uses
`sendBeacon` (or `fetch` with `keepalive: true`). Force a send with `await transport.flush()`;
drain on shutdown with `await transport.close()` / `await log.close()`.

## Picking transports

| Environment | Typical set |
|-------------|-------------|
| Node service | `StdoutTransport` (+ `FileTransport({ stream: true })` if you need files) |
| Node + central log store | add `HttpTransport({ url, headers })` |
| Browser | `ConsoleTransport` (DevTools) + `HttpTransport({ url, useBeacon: true })` |

Mix freely; give error-only sinks a higher `level` (e.g. `new FileTransport({ filename:
"errors.log", level: "error" })`).
