# @youneed/server-middleware-request-logger

Per-request access logging. Emits `METHOD url status durationms [requestId]` for
every request — including ones that end in an error.

```ts
import { Application } from "@youneed/server";
import { requestLogger } from "@youneed/server-middleware-request-logger";

Application()
  .use(requestLogger())
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `log` | `console.log` | sink for the formatted line |
| `format` | `METHOD url status ms [requestId]` | custom formatter for the log line |
| `logger` | — | a `@youneed/logger` `Logger` — switches to structured output |

## Structured logging

Pass a [`@youneed/logger`](../logger) `Logger` to emit one structured record per
request instead of a formatted string:

```ts
import { Application } from "@youneed/server";
import { requestLogger } from "@youneed/server-middleware-request-logger";
import { createLogger } from "@youneed/logger";

Application()
  .use(requestLogger({ logger: createLogger({ level: "info", base: { service: "api" } }) }))
  .listen(3000, () => {});
```

Each request emits `logger.info("request", { method, url, status, ms, requestId, traceId? })`.
The record correlates the `requestId` (and `traceId`, read from `ctx.state.span`
when a trace middleware ran earlier — omitted for the all-zero id), and inherits
the logger's secret **redaction**, so `authorization` / `cookie` / `token` etc.
never leak. Status drives the level: `5xx` and thrown errors → `error` (with the
caught `err`), `4xx` → `warn`, everything else → `info`.
