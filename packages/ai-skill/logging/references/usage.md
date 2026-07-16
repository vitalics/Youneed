# Logging — Where to Use It

## Backend (@youneed/server)

Wire the `request-logger` middleware with a logger, and create a per-request child so every
line carries the `requestId`.

```ts
import { createLogger, format } from "@youneed/logger";
import { StdoutTransport } from "@youneed/logger-transport-stdout";
import { Application, Response } from "@youneed/server";
import { requestLogger } from "@youneed/server-middleware-request-logger";

const logger = createLogger({
  level: config.LOG_LEVEL,
  format: format.combine(format.timestamp(), format.redact(["authorization", "password"]), format.json()),
  defaultMeta: { service: "api", env: process.env.NODE_ENV },
  transports: [new StdoutTransport()],
});

Application()
  .use(requestLogger({ logger }))                 // logs METHOD url status ms [requestId]
  .post("/users", async (ctx) => {
    const reqLog = logger.child({ requestId: ctx.requestId });
    reqLog.info("signup", { email: ctx.body.email });   // password redacted by the pipeline
    return Response.json({ ok: true });
  })
  .listen(config.PORT, () => {})
  .gracefulShutdown({ onShutdown: () => logger.close() });   // flush transports on exit
```

**Correlation:** `request-logger` in structured mode emits one record per request with
`method/url/status/ms/requestId` (and `traceId` if a tracing middleware put a span in
`ctx.state`). 5xx → `error`, 4xx → `warn`, else `info`. Use `logger.child({ requestId })`
inside handlers so application logs join the same correlation id. Across `await` boundaries
deep in the call stack, recover the request with `context()` from `@youneed/server` rather
than threading the logger through every call.

## Frontend (browser)

The universal core logs to `console`; add the http transport to ship logs to your backend.

```ts
import { createLogger, format, ConsoleTransport } from "@youneed/logger";
import { HttpTransport } from "@youneed/logger-transport-http";

const traceId = sessionStorage.getItem("trace-id") ?? crypto.randomUUID();
sessionStorage.setItem("trace-id", traceId);

const log = createLogger({
  level: "debug",
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { traceId },                     // correlate client logs across the session
  transports: [
    new ConsoleTransport(),                     // DevTools
    new HttpTransport({ url: "/api/logs", batchSize: 25, flushInterval: 5000, useBeacon: true }),
  ],
});

log.info("page view", { path: location.pathname });
```

Receive the batch on the server (`POST /api/logs` → array of records) and persist/forward
it. Carrying the same `traceId` on client and server lets you stitch a request end-to-end.

## Config-driven level — @youneed/server-plugin-env

Load and validate env up front (fail-fast); feed the level into the logger.

```ts
import { defineEnvironmentVariables, t, describeEnv } from "@youneed/server-plugin-env";

const schema = {
  PORT: t.port().default(3000),
  LOG_LEVEL: t.enum(["error", "warn", "info", "debug"] as const).default("info"),
  API_KEY: t.string().secret(),
};
const env = defineEnvironmentVariables(process.env, { schema });
// throws EnvError (with .issues[] — ALL problems, not just the first) on bad env

const logger = createLogger({ level: env.LOG_LEVEL });
logger.info("config", describeEnv(env, schema));
// describeEnv() masks `.secret()` values so it's safe to log
```

Builders: `t.string(), t.number(), t.int(), t.boolean(), t.port(), t.url(), t.enum([...] as const), t.json<T>()`,
chained with `.optional()`, `.default(v)`, `.min(n)`, `.max(n)`, `.secret()`. `describeEnv(env, schema)`
returns a log-safe view with secrets masked. On the frontend use `@youneed/dom-provider-env` (same `t`
builder, `import.meta.env` source). Never read `process.env` scattered through the app — load once, pass
the typed env down.
