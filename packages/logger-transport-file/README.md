# @youneed/logger-transport-file

Append log lines to a file — a Node-only transport for [`@youneed/logger`](../logger).

```ts
import { createLogger, format } from "@youneed/logger";
import { FileTransport } from "@youneed/logger-transport-file";

const log = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  transports: [new FileTransport({ filename: "app.log" })],
});
```

## Modes

- **sync** (default) — `appendFileSync`: each record is on disk before `log()`
  returns. Simple and crash-safe.
- **stream** — a buffered append `WriteStream`; non-blocking and much cheaper
  under load. Call `close()` on shutdown to flush.

```ts
const t = new FileTransport({ filename: "app.log", stream: true });
// ... on SIGTERM:
await t.close();
```

## Build

```sh
pnpm --filter @youneed/logger-transport-file run build
```
