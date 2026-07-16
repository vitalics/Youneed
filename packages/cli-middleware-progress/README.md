# @youneed/cli-middleware-progress

Progress bars for [`@youneed/cli`](../cli). The middleware adds **`this.progress`**;
`this.progress.bar()` returns a **reactive** bar whose `update`/`tick`/`complete`
repaint the live region (it's wired to the command like a task), and whose
`render()` draws `label [███░░] 60% · eta 3s`. Use the bar as a field and read it
from `render()`, or just `tick()` it from an imperative `execute()`.

```ts
import { Application, Command } from "@youneed/cli";
import { progress } from "@youneed/cli-middleware-progress";

class Download extends Command("download", { middleware: [progress()] }) {
  async execute() {
    const files = await listFiles();
    const bar = this.progress.bar({ total: files.length, label: "downloading" });
    for (const f of files) {
      await fetchFile(f);
      bar.tick(); // repaints the live region
    }
    bar.complete();
  }
}

const app = Application({ name: "tool", commands: [Download] });
app.run(["download"]);
```

## Exports

- **`progress()`** — middleware. Contributes `this.progress`, a `ProgressApi`.
- **`renderProgressBar(fraction, width?)`** — pure helper that renders a single bar
  of `width` cells (default `24`) for a `0..1` fraction.

## API

- **`ProgressApi`** — `{ bar(options?): ProgressBar }`.
- **`BarOptions`** — `{ total?, label?, width? }`. `total` defaults to `100`,
  `width` to `24`.
- **`ProgressBar`** — `{ total, value, fraction, done, update(v), tick(n?),
  complete(), render(width?) }`. `update`/`tick`/`complete` mutate the value and
  request a repaint; `fraction` is `value/total` clamped to `0..1`; `done` is true
  once `value` reaches `total`.
