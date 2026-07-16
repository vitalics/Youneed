# @youneed/cli example — a tiny ops CLI

Shows the whole `@youneed/cli` stack: commands, typed options, middleware
(`color`, `logger`), `task`, and a live `render` that draws a `table` and
repaints it in place as async work resolves.

```sh
# build the packages first (dist is what the example resolves):
pnpm -r build

# devtools server — the unified <youneed-devtools> shell (SAME UI as the server
# devtools): a shad command/option builder — fill in args/options, Copy or Run.
# Build the UI bundle once, then run (shortcut: `pnpm examples:cli:devtools`):
pnpm --filter @youneed/cli-plugin-devtools build:web
pnpm tsx examples/cli/bin.ts devtools   # → http://127.0.0.1:7331

# music visualiser — cava-style spectrum bars + now-playing + elapsed (real terminal):
pnpm tsx examples/cli/ops.ts play

# dashboard — three elements on independent scheduler ticks (clock 1s, spinner 80ms, gauge 20fps):
pnpm tsx examples/cli/ops.ts dashboard

# interactive wizard — ask / choice / list / confirm / alert (needs a real terminal):
pnpm tsx examples/cli/ops.ts setup

# customised elements — boxed input, custom-rendered list, spinner:
pnpm tsx examples/cli/ops.ts elements

# live status table — run in a real terminal to watch cells fill in:
pnpm tsx examples/cli/ops.ts status

# imperative command with options + logger + colour:
pnpm tsx examples/cli/ops.ts split "a,b,c,d" --first
pnpm tsx examples/cli/ops.ts split "a-b-c" --separator -

# help / version:
pnpm tsx examples/cli/ops.ts --help
pnpm tsx examples/cli/ops.ts --version
```

## What to look at in `ops.ts`

- **`PlayCommand`** — a music visualiser: `music()` provides `this.player`
  (a transport clock), `oscillator()` provides `this.oscillator` (a synthetic
  spectrum). A pending `task` keeps the live region alive for the track;
  `this.scheduler.frame((dt) => this.player.tick(dt), 12)` drives a 12fps
  time-based tick (the runtime repaints after each frame and disposes the timer
  when the track ends — no manual setInterval). `render` draws `spectrumBars(...)`
  over a now-playing line + progress bar — cava in the terminal.
- **`DashboardCommand`** — the scheduler showcase: a clock on `this.scheduler.every(1000)`,
  a spinner on `every(80)`, and a gauge on `frame(…, 20)` — three independent
  cadences the scheduler coalesces into one repaint, all disposed when it ends.
- **`SetupCommand`** — a TUI wizard via the prompt middleware: `this.prompt.ask`
  (text), `.choice` (single-select), `.list` (multi-select), `.confirm` (y/n),
  `.alert` (acknowledge). Each takes over the keyboard and redraws in place.
- **`ElementsCommand`** — customisation: `ask({ box })` frames the input,
  `choice({ format })` renders bespoke rows (coloured severity dots + custom
  pointer), and `this.prompt.spinner(label, work)` animates around async work.
- **`StatusCommand`** — one `task(this, …)` per service (created as fields, run
  in the constructor). `render()` returns a `text\`${table(...)}\`` that reads
  each task's state. On a TTY the runtime repaints only the changed rows via
  cursor-control codes; when piped to a file it writes the final snapshot once.
- **`this.color.background.red(this.color.white(" DOWN "))`** — nested styles
  (foreground over background) compose because each uses its own ANSI close code.
- **`SplitCommand`** — typed `this.options` (`first: boolean`, `separator:
  string`), `this.logger` (structured JSON, child-bound to the program name),
  and `this.color`, all contributed by middleware.
