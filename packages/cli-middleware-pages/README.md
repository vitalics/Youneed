# @youneed/cli-middleware-pages

A built-in pager (`less`-style) for [`@youneed/cli`](../cli). The middleware adds
**`this.pages`** with `show(text)`, which pages long output in the alternate
screen so it never floods the user's scrollback. Keys: ↑/↓ scroll a line,
Space/PageDn page down, `g`/`G` jump to top/bottom, `q`/`Esc` (or Ctrl-C) quit.
The promise resolves when the user quits.

```ts
import { Application, Command } from "@youneed/cli";
import { pages } from "@youneed/cli-middleware-pages";

class Log extends Command("log", { middleware: [pages()] }) {
  async execute() {
    const bigLogString = await readSomeLongLog();
    await this.pages.show(bigLogString); // takes over the screen until `q`
  }
}

const app = Application({ name: "tool", commands: [Log] });
app.run(["log"]);
```

## Exports

- **`pages(options?)`** — middleware. Contributes `this.pages`, a `Pager`.

## Options

- **`PagesOptions`** — `{ terminal? }`. Inject a `Terminal` to drive a scripted
  terminal in tests; defaults to the real `nodeTerminal()`.
- **`Pager`** — `{ show(text): Promise<void> }`. Page through `text`; resolves once
  the user quits.
