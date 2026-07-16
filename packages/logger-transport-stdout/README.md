# @youneed/logger-transport-stdout

Fast Node `process.stdout`/`process.stderr` transport for [`@youneed/logger`](../logger).

The core's universal `ConsoleTransport` goes through the `console` global so it
runs in the browser/DOM, SSR/SSG and the server alike. On a high-throughput Node
server, writing the already-rendered line straight to the process streams skips
`console`'s formatting overhead.

```ts
import { createLogger, format } from "@youneed/logger";
import { StdoutTransport } from "@youneed/logger-transport-stdout";

const log = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  transports: [new StdoutTransport()], // error/warn → stderr, rest → stdout
});
```

Route different levels to `stderr` with `stderrLevels`:

```ts
new StdoutTransport({ stderrLevels: ["error"] }); // warn now goes to stdout
```

## Build

```sh
pnpm --filter @youneed/logger-transport-stdout run build
```
