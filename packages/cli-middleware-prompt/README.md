# @youneed/cli-middleware-prompt

Interactive prompts for [`@youneed/cli`](../cli). The middleware adds
**`this.prompt`** with `ask` (free text), `confirm` (y/n), `choice`
(single-select), `list` (multi-select), `alert` (acknowledge) and `spinner`
(animate while awaiting work). Each prompt takes over the terminal in raw-key
mode and draws through the core `LiveRenderer`, so updates patch in place; every
prompt resolves with the answer (Ctrl-C rejects with a cancel error). All bind to
one terminal, so an injected double makes them testable.

```ts
import { Application, Command } from "@youneed/cli";
import { prompts } from "@youneed/cli-middleware-prompt";

class Setup extends Command("setup", { middleware: [prompts()] }) {
  async execute() {
    const name = await this.prompt.ask("Project name?", { default: "app" });
    const env = await this.prompt.choice("Environment", ["dev", "staging", "prod"]);
    const feats = await this.prompt.list("Features", ["ts", "lint", "tests"]);
    if (await this.prompt.confirm(`Create ${name}?`, { default: true })) {
      await this.prompt.spinner("scaffolding", () => scaffold(name, env, feats));
      await this.prompt.alert("Done!");
    }
  }
}

const app = Application({ name: "create", commands: [Setup] });
app.run(["setup"]);
```

## Exports

- **`prompts(options?)`** — middleware. Contributes `this.prompt`, a `PromptApi`.
- Standalone functions (the same primitives, usable without the middleware):
  **`ask`**, **`confirm`**, **`choice`**, **`list`**, **`alert`**, **`spinner`**.
- Terminal helpers re-exported for tests: **`nodeTerminal`**, **`scriptedTerminal`**,
  **`decodeKeys`**, **`key`**, plus the `box` view and types (`Key`, `Terminal`,
  `ChoiceItem`, `ItemFormatter`, `ItemState`, `BoxOptions`).

## API

- **`PromptApi`** —
  - `ask(message, opts?)` → `Promise<string>` — free-text input.
  - `confirm(message, opts?)` → `Promise<boolean>` — yes/no.
  - `choice(message, items, opts?)` → single-select; `items` are strings or
    `ChoiceItem<T>`, resolving the selected value.
  - `list(message, items, opts?)` → multi-select; resolves an array of values.
  - `alert(message, opts?)` → `Promise<void>` — show a message, any key dismisses.
  - `spinner(label, work, opts?)` → runs `work()` behind an animated spinner, then
    marks it ✓/✗ and resolves/rejects with `work`'s outcome (reads no keys).

## Options

All option types extend `{ terminal? }` (inject a `Terminal` for tests):
`PromptsOptions`, `AskOptions` (`default`, `box`), `ConfirmOptions` (`default`),
`SelectOptions` (`initial`, `format`), `SpinnerOptions` (`frames`, `interval`),
`AlertOptions`.
