# @youneed/cli — Terminal UIs

Build TUIs from the reactive core (`render()` + `task` + a per-command
`scheduler`) and the `cli-middleware-*` view packages. Source: `packages/cli/src/{live,template,elements,scheduler}.ts`.

## The live region (core)

A command's `render()` returns a `text`/`table` template, a string, an array of
lines, or an (async) iterable. On a TTY the output becomes a **live region**:
`LiveRenderer.draw` moves the cursor up over the block and rewrites **only the
changed rows** via ANSI control codes (the terminal twin of dom hole-patching).

```ts
import { Command, task, text, table } from "@youneed/cli";

class Status extends Command("status") {
  #load = task(this, async (signal) => (await fetch("/api/status", { signal })).json());
  render() {
    void this.#load.run();                       // .run() aborts any prior run
    if (this.#load.pending) return text`loading…`;
    return text`status: ${this.#load.value?.state ?? "unknown"}`;  // repaints when the task settles
  }
}
```

`task(host, fn)` gives reactive `pending`/`value`/`error`/`aborted`; each change
calls `host.requestUpdate()`, so a `render` reading `task.value` redraws as work
settles. `table(rows, opts)` renders aligned columns; `text\`…\`` interpolates
holes. Return the **same** template shape each render so only holes repaint.

### Pure view elements (no I/O, no keys)

```ts
import { box, stepper, spinner, select, input, alert, visibleWidth, SPINNER_FRAMES } from "@youneed/cli";

text`${stepper(["Plan", "Build", "Ship"], { current: 1 })}\n${box("hello", { title: "Hi" })}`;
```

`box`/`stepper`/`spinner`/`select`/`input`/`alert` return strings; `visibleWidth`
measures ANSI-aware. The interactive prompts (below) are the controller layer
built on these.

### Animation — the per-command scheduler

```ts
constructor() {
  super();
  this.scheduler.frame((dt) => this.player.tick(dt), 12); // ~12fps, dt = seconds
  this.scheduler.every(1000, () => this.clock.refresh());  // every 1s
}
```

`scheduler.frame`/`every` repaint (coalesced) after each tick; timers are
`unref`'d and disposed when the command ends. See [`optimizations.md`](optimizations.md).

## Full-screen apps — `cli-middleware-screen`

```ts
import { screen } from "@youneed/cli-middleware-screen";
class Top extends Command("top", { middleware: [screen()] }) {
  async execute() {
    const paint = () => this.screen.draw(render(this.screen.columns, this.screen.rows));
    paint();
    this.screen.onResize(paint);    // repaint on resize
  }
}
```

`this.screen` switches to the **alternate screen** (scrollback restored on exit),
hides the cursor, exposes live `columns`/`rows`, and gives `draw`/`clear`/`onResize`.

## Progress bars — `cli-middleware-progress`

```ts
import { progress } from "@youneed/cli-middleware-progress";
class Download extends Command("download", { middleware: [progress()] }) {
  async execute() {
    const bar = this.progress.bar({ total: files.length, label: "downloading" });
    for (const f of files) { await fetchFile(f); bar.tick(); }   // each tick repaints the live region
    bar.complete();
  }
}
```

`bar()` is reactive — `update`/`tick`/`complete` repaint. `renderProgressBar(fraction, width?)`
is a pure helper.

## Interactive prompts — `cli-middleware-prompt`

```ts
import { prompts } from "@youneed/cli-middleware-prompt";
class Setup extends Command("setup", { middleware: [prompts()] }) {
  async execute() {
    const name = await this.prompt.ask("Project name?", { default: "app" });
    const env  = await this.prompt.choice("Environment", ["dev", "staging", "prod"]);
    const feats = await this.prompt.list("Features", ["ts", "lint", "tests"]);
    if (await this.prompt.confirm(`Create ${name}?`, { default: true }))
      await this.prompt.spinner("scaffolding", () => scaffold(name, env, feats));
  }
}
```

`ask`/`confirm`/`choice`/`list`/`alert`/`spinner` take over the terminal in
raw-key mode and draw through `LiveRenderer`; Ctrl-C rejects with a cancel error.
The same functions are exported standalone. Inject a `terminal` for tests
(`scriptedTerminal`). For non-TTY fallbacks see [`accessibility.md`](accessibility.md).

## Pager — `cli-middleware-pages`

```ts
import { pages } from "@youneed/cli-middleware-pages";
class Log extends Command("log", { middleware: [pages()] }) {
  async execute() { await this.pages.show(await readBigLog()); } // less-style; resolves on `q`
}
```

`this.pages.show(text)` pages long output in the alternate screen (↑/↓, Space,
`g`/`G`, `q`/`Esc`), never flooding scrollback.

## Markdown & visualisers

```ts
import { markdown } from "@youneed/cli-middleware-markdown";
import { oscillator, spectrumBars } from "@youneed/cli-middleware-oscillator";

this.markdown("# Title\n\n**bold** and `code`");                 // ANSI-styled string
text`${spectrumBars(this.oscillator.sample(this.t), { height: 10 })}`; // cava-style bars
```

`this.markdown(md)` pretty-prints headings/bold/code/lists/quotes/rules.
`oscillator()` is a deterministic synthetic spectrum (`sample(time)` → per-band
magnitudes); `spectrumBars` renders block bars — drive `t` from `scheduler.frame`.
For the music transport (`this.player`) see [`accessibility.md`](accessibility.md).
