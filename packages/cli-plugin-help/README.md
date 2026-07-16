# @youneed/cli-plugin-help

Enhanced-help plugin for [`@youneed/cli`](../cli). Registers a `help [command]`
command that replaces the built-in help with a grouped command list and
per-command **examples** — the interactive, in-terminal usage screen.

```ts
import { Application } from "@youneed/cli";
import { help } from "@youneed/cli-plugin-help";

Application({
  name: "ops",
  version: "1.0.0",
  description: "Operations toolkit",
  commands: [/* … */],
  plugins: [
    help({ examples: { split: ["ops split a,b,c --first"] } }),
  ],
}).run();

// ops help          → grouped command list with examples
// ops help split    → usage, options and examples for one command
```

When a `help` command is registered the runtime defers to it. For the offline
`man(1)` documentation format, use [`@youneed/cli-plugin-man`](../cli-plugin-man)
instead; `help` is the in-terminal usage, `man` emits roff.

## Exports

- **`help(options?)`** — the plugin. Registers the `help` command.
- **`renderHelp(host, examples, commandName?)`** — render the full help (or one
  command's help) as a string.
- Type: **`Examples`** (`Record<string, string[]>`), **`HelpOptions`**.

## Options

- **`examples`** — per-command example command lines (`{ <command>: string[] }`).
- **`command`** — name of the registered command. Default `"help"`.
