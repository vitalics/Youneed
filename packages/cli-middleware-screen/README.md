# @youneed/cli-middleware-screen

Full-screen TUI buffer for [`@youneed/cli`](../cli). The middleware adds
**`this.screen`**, which switches the terminal to the **alternate screen** so the
app owns the whole viewport and the user's scrollback is restored on exit. It
hides the cursor, exposes the live `columns`/`rows`, and gives `draw(content)`
(clear + home + write), `clear()` and `onResize()`. The app enters the alt screen
on the first draw; the runtime leaves it and restores the cursor on teardown — no
manual cleanup.

```ts
import { Application, Command } from "@youneed/cli";
import { screen } from "@youneed/cli-middleware-screen";

class Top extends Command("top", { middleware: [screen()] }) {
  async execute() {
    const paint = () => this.screen.draw(renderDashboard(this.screen.columns, this.screen.rows));
    paint();
    this.screen.onResize(paint); // repaint on terminal resize
    await untilQuit(); // your own quit signal
  }
}

const app = Application({ name: "monitor", commands: [Top] });
app.run(["top"]);
```

## Exports

- **`screen(options?)`** — middleware. Contributes `this.screen`, a `Screen`.

## Options

- **`ScreenOptions`** — `{ terminal? }`. Inject a `Terminal` for tests; defaults to
  the real `nodeTerminal()`.
- **`Screen`** — `{ columns, rows, draw(content), clear(), onResize(handler) }`.
  `draw` clears and writes from the top-left; `onResize` returns an unsubscribe.
