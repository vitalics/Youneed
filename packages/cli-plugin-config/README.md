# @youneed/cli-plugin-config

Config-file plugin for [`@youneed/cli`](../cli). Loads a config file
(`<name>.config.json`, `.<name>rc`, `.<name>rc.json`, or a `package.json` field)
and merges its values into **option defaults** across the whole app — so users
can persist their preferred flag values instead of typing them every time.

```ts
import { Application } from "@youneed/cli";
import { config } from "@youneed/cli-plugin-config";

Application({
  name: "ops",
  commands: [/* … */],
  plugins: [config()],
}).run();
```

```jsonc
// ops.config.json (or .opsrc / package.json "ops" field)
{
  "separator": ";",          // applies to any option keyed `separator`
  "verbose": true,
  "commands": {
    "split": { "first": true } // applies only to the `split` command
  }
}
```

Top-level keys seed the default of any option with that key (app-wide and
per-command); a `commands.<name>` section narrows to one command. Resolution ends
up as **CLI flag > env > config file > built-in default** — this differs from env
loading: env reads `process.env` per command, config reads a file and seeds
defaults app-wide.

## Exports

- **`config(options?)`** — the plugin. Loads the file (or `options.data`) at setup
  and applies it to the catalogue's option defaults.
- **`loadConfigFile(name, options?)`** — load the first matching file, or
  `undefined`.
- **`applyConfig(host, data)`** — merge a `ConfigData` object into a host's option
  defaults.
- Types: **`ConfigData`**, **`ConfigOptions`**.

## Options

- **`data`** — use this object directly instead of reading a file (handy in tests).
- **`files`** — candidate filenames relative to `cwd`. Defaults derived from the
  app name.
- **`cwd`** — directory to search. Default `process.cwd()`.
- **`packageKey`** — `package.json` field to read when the `package.json`
  candidate matches. Default the app name.
