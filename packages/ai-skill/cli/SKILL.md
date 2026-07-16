---
name: youneed-cli
description: "Building command-line tools with @youneed/cli — a type-safe, Commander-style CLI framework on the @youneed factory-class pattern (commands and options as classes, this.options/execute(...) typed straight from flag strings), plus a reactive render()/task live region, onion middleware (providers), application plugins, and graceful shutdown. Covers the cli-middleware-*/cli-plugin-* ecosystem: terminal UIs (screen, progress, prompt, pages, oscillator, color, markdown), input/process security (env, childprocess, fs, worker, clipboard), startup/redraw optimization (cache, worker, scheduler), and accessibility (NO_COLOR/TTY detection, notification, music, i18n). This skill should be used when defining commands or options, building a terminal UI / TUI, validating CLI input or env, spawning subprocesses safely, prompting interactively, speeding up CLI startup or redraws, or making a CLI screen-reader / non-TTY friendly."
license: ISC
---

# youneed — CLI Framework

[`@youneed/cli`](../../cli) is a Commander-style CLI on the same factory-class
shape as [`@youneed/dom`](../../dom)'s `Component` and `@youneed/server`'s
`Controller`. Define options and commands as classes; `this.options` and
`execute(...)` are typed **straight from your flag and argument strings**. On top
of the parser sits a reactive layer: a command can return a declarative
`render()` that repaints **in place** on a TTY as async `task`s settle, plus
middleware (providers), application plugins, and graceful shutdown.

Source of truth: `packages/cli/src/{application,command,option,parse,task,live,scheduler,plugin,template,elements,terminal}.ts`
and each `packages/cli-middleware-*/README.md` / `packages/cli-plugin-*/README.md`.
Verify a signature in source before asserting it.

Route to the reference file(s) for the task. Each is self-contained and < 200 lines.
Load only what the task needs; do not read all of them up front.

| Task | Read |
|------|------|
| Build a terminal UI — `render()`/`task` live region, screen, progress bars, prompts, pager, visualisers, markdown | [`references/tui.md`](references/tui.md) |
| Validate input/env, spawn subprocesses safely, temp files, workers, clipboard, secrets, shell-injection | [`references/security.md`](references/security.md) |
| Speed up startup, lazy plugin loading, on-disk cache, worker offload, the redraw scheduler, avoid redundant repaints | [`references/optimizations.md`](references/optimizations.md) |
| NO_COLOR/FORCE_COLOR/TTY detection, `--no-color`, non-TTY/reduced output, prompt fallbacks, notifications, i18n | [`references/accessibility.md`](references/accessibility.md) |

For data validation done via schemas, see also the [`youneed-orm`](../orm/SKILL.md)
and core [`youneed`](../SKILL.md) skills (`t`/`Infer` come from `@youneed/schema`).

## At a glance

```ts
import { Application, Command, Option, option, t, task, text, defaultOptions } from "@youneed/cli";

class FirstOption extends Option("--first", { short: "f" }) {}   // class form

class Split extends Command({
  name: "split <string>",                                        // grammar: word + positional
  description: "Split a string and print the array",
  options: [FirstOption, option("-s, --separator <char>", { default: "," }), ...defaultOptions()],
}) {
  execute(value: string) {
    const limit = this.options.first ? 1 : undefined;            // this.options typed from flags
    console.log(value.split(this.options.separator, limit));     // value typed from <string>
  }
}

// Reactive command: render() + task live region (repaints in place on a TTY).
class Status extends Command("status") {
  #load = task(this, async (signal) => (await fetch("/api/status", { signal })).json());
  render() {
    void this.#load.run();
    return this.#load.pending ? text`loading…` : text`status: ${this.#load.value?.state ?? "?"}`;
  }
}

Application({ name: "tool", version: "0.0.1", commands: [Split, Status], options: [...defaultOptions()] });
```

`Application(config)` runs immediately on creation. For tests, pass
`autoRun: false` and call `app.run(argv)` with injected `stdout`/`stderr`/`exit`.

## Ground rules (apply to all @youneed/cli code)

- **The flag string drives the type.** A value flag (`--max <n>`) is `string` by
  default, a bare flag (`--first`) is `boolean`. Refine with `type: Number`, a
  `schema: t.number()`, or `required: true` — never re-type `this.options` by hand.
- **`render()` vs `execute()`.** `execute(...)` is imperative (write with
  `console.log`); `render()` returns a `text`/`table` template (or string / async
  iterable) and becomes a **live region** on a TTY. A command implements one or
  the other. The runner keeps the process alive until all of a command's `task`s
  settle (or shutdown aborts them).
- **Middleware are providers, not Express middleware.** A `CliMiddleware` has
  `install(ctx)` that augments the instance with a typed member (`this.color`,
  `this.env`, …), installed after options parse, before `execute`/`render`. Its
  contribution is folded into the command's `this` type automatically. Plugins
  (`plugins: [...]`) are app-level: they see the whole catalogue and run
  lifecycle hooks (`beforeCommand`/`afterCommand`/`onError`).
- **Graceful shutdown is on by default.** SIGINT/SIGTERM aborts
  `this.abortSignal` (and the command's tasks), runs teardown LIFO, and exits
  `130`/`143`. `childprocess`/`worker` handles are killed/terminated on shutdown;
  `fs` temp dirs are removed. Configure via `shutdown: { signals, timeoutMs,
  onShutdown }` or disable with `shutdown: false`.
- **Verify symbols against source.** Canonical exports are in
  `packages/cli/src/index.ts`; each middleware/plugin exports a single factory
  (e.g. `color()`, `env(schema)`) named in its README.

## Answering style

- Give a concrete, compilable `@youneed/cli` snippet — not just prose.
- When recommending a middleware/plugin, name the exact package and the
  `middleware: [...]` / `plugins: [...]` entry, and the `this.<member>` it adds.
- Prefer the class form (`Command(...)`/`Option(...)`) unless the user is already
  using the inline `option(...)` / `{ name }` entry form.
- Reach for `render()` + `task` for anything that should animate or repaint;
  reach for `execute()` for one-shot, write-and-exit commands.
