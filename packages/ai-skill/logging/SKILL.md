---
name: youneed-logging
description: "Logging for the youneed framework: the universal @youneed/logger core (createLogger, levels, JSON/format pipeline, secret redaction, child loggers, transport contract), the transport packages (@youneed/logger-transport-stdout, -file, -http), and @youneed/server-plugin-env for fail-fast env loading. This skill should be used when setting up logging, choosing transports, redacting secrets, correlating logs by requestId/traceId on the backend, shipping browser/client logs over HTTP, or wiring log level from config."
license: ISC
---

# youneed — Logging

`@youneed/logger` is a **universal** core (works in browser, Node, workers, edge — no
`node:*` imports; default output is `console`). Node- or browser-specific delivery lives in
separate transport packages. Source of truth: `packages/logger/src/index.ts` and each
transport's `src/index.ts` — verify a signature there before asserting it.

| Task | Read |
|------|------|
| `createLogger`, levels, `format.*` pipeline, redaction, `child()`, transport contract | `references/logger-core.md` |
| stdout / file / http transports — options, batching, flush/close | `references/transports.md` |
| Where to use it (backend correlation, frontend shipping) + `@youneed/server-plugin-env` | `references/usage.md` |

## At a glance

```ts
import { createLogger, format } from "@youneed/logger";
const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.redact(), format.json()),
  defaultMeta: { service: "api" },
});
log.info("started", { port: 3000 });          // → JSON line on console by default
const reqLog = log.child({ requestId });        // contextual fields for one request
```

- **Universal core**, console by default. Add transports for real delivery.
- **Levels** (NPM): `error < warn < info < http < verbose < debug < silly`.
- **Redaction** is a format step (`format.redact()`), deep + case-insensitive, with sane
  default keys (authorization/password/token/cookie/secret/apikey/…).
- **child(meta)** layers contextual fields; precedence is per-call > child > `defaultMeta`.
- **Transports** plug in via `transports:` or `log.add()/remove()`; flush on shutdown with
  `await log.close()` (or `await using`).

## Answering style

- Always show the `format` pipeline (timestamp + redact + json is the safe default).
- On the backend, tie logs to the request with `child({ requestId })` and the
  `request-logger` middleware; on the frontend, ship batched logs via the http transport.
- Drive `level` from `@youneed/server-plugin-env` rather than reading `process.env` directly.
