# @youneed/cli-plugin-man

Man-page plugin for [`@youneed/cli`](../cli). Registers a `man` command that
emits **roff/troff** documentation generated from the app's command catalogue —
the offline `man(1)` format (sections, `.TP` entries) you ship as a `.1` file or
pipe straight to `man`.

```ts
import { Application } from "@youneed/cli";
import { man } from "@youneed/cli-plugin-man";

Application({
  name: "ops",
  version: "1.0.0",
  description: "Operations toolkit",
  commands: [/* … */],
  plugins: [man()],
}).run();

// ops man > ops.1   →   man ./ops.1
```

Distinct from `--help`: `man` produces the offline page format, while
[`@youneed/cli-plugin-help`](../cli-plugin-help) renders the interactive
in-terminal usage.

## Exports

- **`man(options?)`** — the plugin. Registers the `man` command.
- **`generateMan(host, exclude?)`** — produce the roff man page for a host as a
  string (the `man` command itself is normally excluded).
- Type: **`ManOptions`**.

## Options

- **`command`** — name of the registered command. Default `"man"`.
