# @youneed/cli-plugin-completion

Shell-completion plugin for [`@youneed/cli`](../cli). Registers a `completion`
command that prints a **bash / zsh / fish** completion script generated from the
app's command catalogue — it completes command names at the first position and
each command's option flags after. The shell is taken from the argument or
detected from `$SHELL`.

```ts
import { Application } from "@youneed/cli";
import { completion } from "@youneed/cli-plugin-completion";

Application({
  name: "ops",
  commands: [/* … */],
  plugins: [completion()],
}).run();

// then, in the user's shell:
//   ops completion >> ~/.bashrc          # bash
//   ops completion zsh >> ~/.zshrc       # zsh
//   eval "$(ops completion)"             # current session
```

The script is built from the live catalogue, so new commands and options show up
in completion automatically — there is nothing to regenerate by hand.

## Exports

- **`completion(options?)`** — the plugin. Registers the completion command.
- **`generateCompletion(spec, shell)`** — produce a script string for a
  `CompletionSpec` and a `Shell` (`"bash" | "zsh" | "fish"`).
- **`buildSpec(host, exclude?)`** — flatten a `PluginHost` into a `CompletionSpec`
  (the completion command itself is normally excluded).
- **`detectShell()`** — best-effort shell from `$SHELL`, defaulting to `bash`.
- Types: **`Shell`**, **`CompletionSpec`**, **`CompletionOptions`**.

## Options

- **`command`** — name of the registered command. Default `"completion"`.
