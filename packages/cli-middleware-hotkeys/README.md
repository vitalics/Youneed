# @youneed/cli-middleware-hotkeys

Global key handlers for [`@youneed/cli`](../cli) commands. Install the middleware
and your command gains **`this.keys`** — register listeners over the raw terminal
input layer by **logical key name** (`"up"`, `"q"`, `"enter"`, …) or by
`"ctrl-<name>"` (e.g. `"ctrl-c"`). This is what you want for interactive,
long-running commands — watchers, dashboards, players — where a keystroke should
trigger an action without prompting. Capture starts when the middleware installs
and is released automatically on teardown.

```ts
import { Application, Command, text } from "@youneed/cli";
import { hotkeys } from "@youneed/cli-middleware-hotkeys";

class Watch extends Command("watch", { middleware: [hotkeys()] }) {
  #status = "watching — press r to rebuild, q to quit";

  async execute() {
    await new Promise<void>((done) => {
      this.keys.on("r", () => {
        this.#status = "rebuilding…";
        this.requestUpdate();
        rebuild().then(() => {
          this.#status = "watching — press r to rebuild, q to quit";
          this.requestUpdate();
        });
      });
      this.keys.on("q", done);       // q ends the command
      this.keys.on("ctrl-c", done);  // so does Ctrl-C
    });
  }

  render() {
    return text`${this.#status}`;
  }
}

Application({ name: "dev", commands: [Watch] });
```

## `this.keys`

- **`on(name, handler)`** — register a listener for a key. `name` is the logical
  key (`"up"`, `"down"`, `"enter"`, `"q"`, …) or the `"ctrl-<name>"` form
  (`"ctrl-c"`). The `handler` receives the raw [`Key`](../cli) object. Returns an
  **unsubscribe** function.
- **`off(name, handler)`** — remove a previously-registered handler.

Multiple handlers can be registered for the same key; all of them fire. A
`ctrl`-modified key dispatches to **both** `name` and `ctrl-<name>`.

## Options

`hotkeys(options?)` accepts:

- **`terminal`** — the [`Terminal`](../cli) to capture. Defaults to the real
  terminal (`nodeTerminal()`). Pass a scripted terminal in tests to drive keys
  deterministically.

## Exports

- **`hotkeys(options?)`** — the middleware factory. Contributes `this.keys`.
- **`Hotkeys`** — type of the `this.keys` surface.
- **`HotkeysOptions`** — `{ terminal? }`.
