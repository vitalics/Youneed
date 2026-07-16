# @youneed/logger-plugin-location

Stamp each [`@youneed/logger`](../logger) record with the call site it was logged
from — `file:line:column`.

```ts
import { createLogger, format } from "@youneed/logger";
import { locationPlugin } from "@youneed/logger-plugin-location";

const log = createLogger({
  format: format.combine(
    format.timestamp(),
    format.printf((i) => `[${i.timestamp}] ${i.location} ${String(i.message)}`),
  ),
  plugins: [locationPlugin()],
});

log.info("starting up");
// [2026-06-22T15:36:00Z] app.ts:24:7 starting up
```

With `json()` the call site is a field instead:

```ts
createLogger({ format: format.json(), plugins: [locationPlugin()] });
log.info("hi"); // {"level":"info","message":"hi","location":"app.ts:24:7"}
```

## How it works

Capturing the call site reads a stack trace at log time — a per-record concern —
so the mechanism is a **format** (`location()`), and the plugin prepends it via
`logger.useFormat(...)` so the field exists before `json()`/`printf` render. Use
the format directly if you prefer to control pipeline order:
`format.combine(location(), timestamp(), json())`.

Stack inspection uses V8 (`Error.prepareStackTrace`); on engines without it the
field is simply omitted.

## Options

| option | default | meaning |
|---|---|---|
| `key` | `"location"` | record field to write |
| `root` | `process.cwd()` | base directory for relative paths |
| `relative` | `true` | emit a path relative to `root` (vs. absolute) |
| `column` | `true` | include `:column` |
| `message` | `false` | prepend `"file:line:col "` to the message instead of a field |
| `internal` | core matcher | extra frames to treat as internal and skip |

## Build

```sh
pnpm --filter @youneed/logger-plugin-location run build
```
