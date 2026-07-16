# @youneed/cli-plugin-update-notifier

Update-notifier plugin for [`@youneed/cli`](../cli). After a command runs, it
checks the npm registry for a newer published version and, if one exists, prints
a notice to stderr. The check is throttled (once a day by default) via a stamp
file, the network fetch is best-effort and injectable, and it **never blocks or
fails** the command.

```ts
import { Application } from "@youneed/cli";
import { updateNotifier } from "@youneed/cli-plugin-update-notifier";

Application({
  name: "ops",
  version: "1.0.0",
  commands: [/* … */],
  plugins: [updateNotifier({ current: "1.0.0" })],
}).run();

// after a command, if a newer version is on npm:
//   Update available: 1.0.0 → 1.2.0
//   Run `npm i -g ops` to update.
```

The notice fires from the `afterCommand` lifecycle hook. The package name
defaults to the program name; throttling is keyed per package in the OS temp dir.

## Exports

- **`updateNotifier(options)`** — the plugin.
- **`isNewer(latest, current)`** — `major.minor.patch` comparison helper.
- Type: **`UpdateNotifierOptions`**.

## Options

- **`current`** *(required)* — the currently-running version.
- **`name`** — npm package name to query. Defaults to the program name.
- **`interval`** — minimum ms between checks (throttled via a stamp file).
  Default 1 day; `0` disables throttling.
- **`fetchLatest(name)`** — inject the latest-version lookup. Default queries the
  npm registry.
