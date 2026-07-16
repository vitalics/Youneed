# @youneed/cli-middleware-logger

Structured logging for [`@youneed/cli`](../cli) commands, backed by
[`@youneed/logger`](../logger). Install the middleware and your command gains
**`this.logger`** — a real `Logger` whose **level is wired from the run's flags**:
`--verbose`/`-v` lowers it to `debug`, `--quiet`/`-q` raises it to `warn`, and an
explicit `--log-level <lvl>` wins over both. The command name is attached as child
meta, so every line a command emits is tagged with the command it came from.

```ts
import { Application, Command } from "@youneed/cli";
import { logger } from "@youneed/cli-middleware-logger";

class Deploy extends Command({
  name: "deploy <env>",
  options: [{ name: "-v, --verbose" }, { name: "-q, --quiet" }],
  middleware: [logger()],
}) {
  execute(target: string) {
    this.logger.info("deploying", { target });
    this.logger.debug("resolved config", { region: "eu" }); // shown only with -v
  }
}

Application({ name: "ops", commands: [Deploy] });
```

## `this.logger`

A [`@youneed/logger`](../logger) `Logger` (`info`/`debug`/`warn`/`error`/`child`,
mutable `level`). The middleware sets its level from the run's flags and binds the
command name as child meta (e.g. `{ command: "ops" }`).

## Level resolution

Highest priority first:

1. **`--log-level <lvl>`** (option key `logLevel`) — explicit level string wins.
2. **`--verbose` / `-v`** (option key `verbose`) — sets `debug`.
3. **`--quiet` / `-q`** (option key `quiet`) — sets `warn`.
4. The `level` passed in `LoggerMiddlewareOptions`.

The command only reacts to flags it actually declares in its `options`.

## Configuration

`logger(init?)` accepts either an existing `Logger` (reused, **not** disposed by
the middleware) or `LoggerMiddlewareOptions`, which extends
[`LoggerOptions`](../logger) plus:

- **`verboseKey`** — option key for the verbose toggle. Default `"verbose"`.
- **`quietKey`** — option key for the quiet toggle. Default `"quiet"`.
- **`levelKey`** — option key for an explicit level string. Default `"logLevel"`.
- **`bindCommand`** — meta key the command name is bound under. Default
  `"command"`; pass `false` to skip the child logger.

A logger the middleware **creates** is registered for teardown — its transports
are closed (`Disposable` / `AsyncDisposable`) once the command settles. A logger
you pass in is left untouched.

## Exports

- **`logger(init?)`** — the middleware factory. Contributes `this.logger`.
- **`LoggerMiddlewareOptions`** — the options type.
- **`Logger`** — re-exported logger type.
