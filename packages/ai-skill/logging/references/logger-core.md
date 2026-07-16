# @youneed/logger — Core

Universal logger (no `node:*`). Source: `packages/logger/src/index.ts`.

## createLogger

```ts
import { createLogger, format, ConsoleTransport } from "@youneed/logger";

const log = createLogger({
  level: "info",                 // default "info"
  levels: NPM_LEVELS,            // default NPM level map
  format: format.combine(format.timestamp(), format.json()),  // default
  defaultMeta: { service: "api", env: "prod" },               // base fields on every record
  transports: [new ConsoleTransport()],                       // default [ConsoleTransport]
});
```

`Logger` methods (all chainable, return the logger):
`error/warn/info/http/verbose/debug/silly(message, meta?)`, `log(level, message, meta?)`,
`child(meta)`, `add(t)/remove(t)/clear()`, `transports` (readonly), `close()`.

```ts
log.info("server started", { port: 3000 });
log.error("db failed", { err, password: "secret" });   // password redacted if redact() in pipeline
```

## Levels

`NPM_LEVELS`: `error:0, warn:1, info:2, http:3, verbose:4, debug:5, silly:6`. A record is
emitted when its level is ≤ the logger's (and ≤ a transport's own `level`, if set).

## Format pipeline

`format` is callable and composable:

```ts
format.combine(...formats)                 // pipeline
format.timestamp({ key?, format? })        // add ISO (or custom) time field
format.json({ space? })                    // render as JSON (default output)
format.simple()                            // "info: msg {meta}"
format.printf(info => `${info.level}: ${info.message}`)
format.label({ label, message? })
format.colorize({ level? })                // ANSI (terminal); filtering still uses real level
format.redact(keys?, { replacement? })     // deep mask secrets
format((info) => info /* or false to drop */)()   // custom step
```

Default pipeline is `combine(timestamp(), json())`. Per-transport `format` overrides the
logger format for that transport only.

## Redaction

```ts
format.redact(["ssn", "creditCard"], { replacement: "***" })  // default replacement "[REDACTED]"
```

Recursive, case-insensitive. Default keys include
`authorization, password, passwd, pwd, token, accesstoken, refreshtoken, cookie, set-cookie,
secret, apikey, api_key, x-api-key`. Put `redact()` before `json()` in the pipeline.

## Child loggers

```ts
const reqLog = log.child({ requestId: "r-42", userId: 123 });
reqLog.info("request start");   // includes service + requestId + userId
```

Children share the parent's level/format/transports; only meta is layered. Precedence:
per-call meta > child meta > `defaultMeta`. Children can nest.

## Transport contract

Built-in: `ConsoleTransport` (universal), `StreamTransport` (any `{ write() }`),
`Transport` (abstract base), `createTransport(opts)`.

```ts
interface LogTransport {
  level?: string;
  format?: Format;
  log(info: TransformableInfo, next?: () => void): void;
  close?(): void | Promise<void>;
  [Symbol.dispose]?(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
}
```

Custom transport — extend `Transport`, use the `rendered(info)` / `levelOf(info)` helpers
(`LEVEL`/`MESSAGE` symbols carry the immutable level and the final rendered string):

```ts
import { Transport, rendered, levelOf } from "@youneed/logger";
class MyTransport extends Transport {
  log(info, next) { console.log(`[${levelOf(info)}] ${rendered(info)}`); next?.(); }
}
```

## Resource management

`using log = createLogger(...)` (sync dispose) or `await using log = createLogger(...)`
(async — flushes file/http transports). Or explicitly `await log.close()` on shutdown.
