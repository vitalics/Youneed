# @youneed/logger-plugin-datadog

Stamp Datadog-standard default fields on every [`@youneed/logger`](../logger)
record — the canonical `defaultMeta` use-case for the plugin system.

```ts
import { createLogger, format } from "@youneed/logger";
import { datadog } from "@youneed/logger-plugin-datadog";

const log = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  plugins: [datadog({ service: "api", env: "prod", version: "1.4.0", tags: { team: "core" } })],
});

log.info("listening", { port: 3000 });
// {"level":"info","message":"listening","timestamp":"…","ddsource":"nodejs",
//  "service":"api","ddtags":"env:prod,version:1.4.0,team:core","port":3000}
```

Unset options fall back to the **DD_\*** environment (unified service tagging):
`DD_SERVICE`, `DD_ENV`, `DD_VERSION`, `DD_HOSTNAME`. `env`/`version` are folded
into `ddtags`; `ddsource` defaults to `"nodejs"`. Pass `meta` for arbitrary extra
defaults (they win over the computed Datadog fields).

The environment is read via `globalThis.process`, so the plugin also works in the
browser/edge — just pass `service`/`env` explicitly there.

## Build

```sh
pnpm --filter @youneed/logger-plugin-datadog run build
```
