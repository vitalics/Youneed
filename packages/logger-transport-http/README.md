# @youneed/logger-transport-http

Batch-ship log records to an HTTP endpoint — a **universal** transport for
[`@youneed/logger`](../logger). Built on the platform `fetch` (plus
`navigator.sendBeacon` for the browser unload flush), so it runs unchanged in
the browser/DOM, SSR/SSG, the server, workers and at the edge.

```ts
import { createLogger, format } from "@youneed/logger";
import { HttpTransport } from "@youneed/logger-transport-http";

const log = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  transports: [new HttpTransport({ url: "/_logs", batchSize: 50, flushInterval: 2000 })],
});
```

A batch is sent when it reaches `batchSize` **or** after `flushInterval` ms. In
the browser the buffer is flushed via `sendBeacon` on `pagehide` so logs aren't
lost on navigation. Network errors are swallowed unless you pass `onError`.

```ts
new HttpTransport({
  url: "https://logs.example.com/ingest",
  headers: { authorization: `Bearer ${token}` },
  transform: (info) => ({ level: info.level, message: info.message, ...info }), // ship structured
  onError: (err) => console.error("log shipping failed", err),
});
```

Call `await transport.close()` on shutdown to stop the timer and drain.

## Build

```sh
pnpm --filter @youneed/logger-transport-http run build
```
