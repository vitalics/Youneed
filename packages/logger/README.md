# @youneed/logger

A zero-dependency, **Winston-style** structured logger: pluggable **transports**
(each with its own level + format) and a composable **format** pipeline.

**Universal core.** This package touches no Node-only API (no `node:fs`, no
`process`), so the exact same bundle runs in the browser/DOM, in SSR/SSG, on the
server, in workers and at the edge. The only built-in destination is a
`ConsoleTransport` backed by the universal `console` global. Environment-specific
destinations live in companion packages — `@youneed/logger-transport-<name>` —
mirroring how server middleware lives in `@youneed/server-middleware-<name>`.

```ts
import { createLogger, format, ConsoleTransport } from "@youneed/logger";

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.redact(["ssn"]), format.json()),
  defaultMeta: { service: "api" },
  transports: [new ConsoleTransport()], // works in the browser and on the server
});

log.info("listening", { port: 3000 });
// {"level":"info","message":"listening","timestamp":"…","service":"api","port":3000}

const reqLog = log.child({ requestId: "r-42" }); // bindings on every record
reqLog.error("db down", { password: "hunter2" }); // password → "[REDACTED]"
```

## Transports

A transport is a destination. Each may carry its own `level` and `format`; a record
reaches a transport only when its severity passes `transport.level ?? logger.level`.

Built into the universal core:

- **`new ConsoleTransport(opts?)`** — routes through the `console` global
  (`error`→`console.error`, `warn`→`console.warn`, `info`/`http`→`console.info`,
  `debug`/`verbose`/`silly`→`console.debug`, else `console.log`). The default.
  Pass `{ console }` to target a custom surface. Pass `{ color: true | false |
  "auto" }` to tint the line by severity — `"auto"` (default) enables color only
  on a TTY, honoring `NO_COLOR`/`FORCE_COLOR` (off in the browser, where ANSI
  isn't rendered). The standalone `supportsColor()` helper is exported too.
- **`new StreamTransport({ stream, ... })`** — any `WritableLike` (`{ write }`).
- **`createTransport({ log, level?, format? })`** — an ad-hoc transport.
- **`class Transport`** — extend it and implement `log(info, next?)` for your own
  destination. The helpers `rendered(info)` and `levelOf(info)` are exported so
  custom transports render and route exactly like the built-ins.

Environment-specific destinations ship separately (install only what you need):

- **`@youneed/logger-transport-stdout`** (Node) — fast `process.stdout`/`stderr`
  writer for high-throughput servers.
- **`@youneed/logger-transport-file`** (Node) — append to a file (sync or buffered stream).
- **`@youneed/logger-transport-http`** (universal) — batch-ship records over
  `fetch`/`sendBeacon`; ideal for shipping browser/DOM logs to a server.

Manage them at runtime: `logger.add(t)`, `logger.remove(t)`, `logger.clear()`,
`logger.transports`.

### Disposal

The logger and every built-in transport implement TC39 explicit resource
management (`Symbol.dispose` / `Symbol.asyncDispose`), so file handles, sockets
and buffered batches are released deterministically. `logger.close()` disposes
all transports (awaiting async ones) and is idempotent.

```ts
{
  await using log = createLogger({ transports: [new HttpTransport({ url: "/_logs" }), fileTransport] });
  log.info("work"); // …
} // ← scope exit: pending HTTP batch flushed, file stream closed

// or explicitly, e.g. in a SIGTERM handler:
await log.close();
```

Custom transports get this for free: extend `Transport` and override `close()`
(sync or async), or pass `close` to `createTransport({ log, close })`. Children
share their parent's transports — close the **root** logger.

```ts
import { ConsoleTransport } from "@youneed/logger";
import { HttpTransport } from "@youneed/logger-transport-http";

// Same logger code in a browser app — console for dev, HTTP shipping for telemetry.
const log = createLogger({ transports: [new ConsoleTransport(), new HttpTransport({ url: "/_logs", level: "warn" })] });
```

## Plugins

A plugin is a cross-cutting extension installed once on the logger — for
concerns that aren't a single transport or format (enriching every record,
wiring process-level handlers, sampling). The contract is small:

```ts
interface LoggerPlugin {
  name: string;
  install(logger: Logger): void | Disposable | AsyncDisposable;
}
```

`install` runs at registration and may call `logger.add()` (a transport),
`logger.defaults()` (merge fields into the default meta), or `logger.useFormat()`
(prepend a per-record format, so an added field is present before `json()`
serializes). Anything it returns is torn down with the logger on `close()`. Register via the `plugins` option or
`logger.use(plugin)` at runtime. Ship reusable plugins as
`@youneed/logger-plugin-<name>` (mirroring the transport packages):

- **`@youneed/logger-plugin-exception`** (Node) — Winston-style
  `uncaughtException`/`unhandledRejection` handlers (log, flush, exit).
- **`@youneed/logger-plugin-datadog`** — stamp Datadog-standard default fields
  (`ddsource`/`service`/`ddtags`) on every record, from options or `DD_*` env.
- **`@youneed/logger-plugin-location`** — stamp each record with the call site
  (`file:line:column`) it was logged from.

```ts
import { exceptionHandler } from "@youneed/logger-plugin-exception";
import { datadog } from "@youneed/logger-plugin-datadog";

const log = createLogger({ plugins: [datadog({ service: "api", env: "prod" }), exceptionHandler()] });
```

## Formats

`format` is callable (`format(fn)` wraps a transform) and exposes combinators:

- **`combine(...formats)`** — run left-to-right (returning `false` drops the record).
- **`timestamp({ key?, format? })`** — add a timestamp field (`format` is injectable).
- **`json({ space? })`** — render `{ level, message, ...meta }` into `info[MESSAGE]`.
- **`simple()`** — `"<level>: <message> <meta?>"`.
- **`printf((info) => string)`** — fully custom line.
- **`colorize({ level? })`** — ANSI-color the level (filtering still uses the real level).
- **`label({ label, message? })`** — tag records.
- **`redact(keys?, { replacement? })`** — deep-mask secret fields (common keys like
  `authorization`/`password`/`token`/`cookie` are always masked; pass extra keys).

Write your own with the factory:

```ts
const upper = format((info) => { info.message = String(info.message).toUpperCase(); return info; })();
createLogger({ format: format.combine(upper, format.json()) });
```

## Levels

Default npm levels (`error:0, warn:1, info:2, http:3, verbose:4, debug:5, silly:6`);
override via `createLogger({ levels })`. Methods: `error/warn/info/http/verbose/debug/silly(message, meta?)`
plus `log(level, message, meta?)`.

## Symbols

`LEVEL` / `MESSAGE` are `Symbol.for("level")` / `Symbol.for("message")` — the same
well-known symbols Winston uses, so `info[MESSAGE]` carries the final rendered string
and `info[LEVEL]` the immutable level used for filtering.
