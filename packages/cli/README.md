# @youneed/cli

A type-safe, Commander-style CLI framework on the **@youneed factory-class
pattern**. Define options and commands as classes, compose them into an
`Application`, and get `this.options` and `execute(...)` typed **straight from
your flag and argument strings** — no manual generics, no separate type
definitions. The same class+config shape as [`@youneed/dom`](../dom)'s
`Component` and [`@youneed/server`](../server)'s `Controller`, applied to the
terminal.

On top of the parser it adds a small reactive layer: commands can return a
declarative `render()` (the CLI counterpart of a dom/ssr `render`) that
repaints **in place** on a TTY as async [`task`](#tasks)s resolve, plus
graceful shutdown, middleware, and plugins.

## Install

```bash
pnpm add @youneed/cli
```

## Defining and running a command

```ts
import { Application, Command, Option, defaultOptions } from "@youneed/cli";

// A reusable, named option (its key + value type flow into `this.options`).
class FirstOption extends Option("--first", {
  short: "f",
  description: "display just the first substring",
}) {}

class SplitCommand extends Command({
  name: "split <string>", // grammar: a word + positional args
  description: "Split a string into substrings and display as an array",
  options: [FirstOption, { name: "-s, --separator <char>", default: "," }, ...defaultOptions()],
}) {
  execute(value: string) {
    // `value` is typed from `<string>`; `this.options` from the options tuple.
    const limit = this.options.first ? 1 : undefined;
    console.log(value.split(this.options.separator, limit));
  }
}

Application({
  name: "string-util",
  description: "CLI to some JavaScript string utilities",
  version: "0.0.8",
  commands: [SplitCommand],
  options: [...defaultOptions()],
});
```

`Application(config)` runs immediately on creation (like Commander's `program`).
For tests, pass `autoRun: false` and call `app.run(argv)` yourself with injected
`stdout`/`stderr`/`exit`/`argv`.

## Options

`Option(flag, config?)` returns a value that doubles as a **base class** and as
a ready-to-use **entry** — both forms work in a command's `options` array:

```ts
class FirstOption extends Option("--first", { short: "f" }) {}     // class form
const separator = option("-s, --separator <char>", { default: "," }); // inline form
```

The flag string drives the type: a value flag (`--max <n>`) is `string` by
default, a bare flag (`--first`) is `boolean`. Coerce or validate to refine it:

```ts
import { option, t } from "@youneed/cli";

option("--max <n>", { type: Number });           // this.options.max: number
option("--port <p>", { schema: t.number() });     // validate via @youneed/schema
option("--first [arg]", { required: true });       // a gate — errors if absent
```

`t` (and the `Infer` type) are re-exported from [`@youneed/schema`](../schema)
for `schema:` validation; any Standard Schema (zod/valibot) works too.
`defaultOptions()` returns the conventional `-h, --help` and `-V, --version`
entries — spread them into a command's or the application's `options`.

## Declarative `render()` and tasks

A command may implement `render()` instead of `execute()` — return a string, an
array of lines, or an (async) iterable, and the runner writes it. Returning a
template (`text`/`table` from this package) turns the output into a **live
region**: on a TTY each repaint patches only changed lines via cursor control.

```ts
import { Command, task, text } from "@youneed/cli";

class StatusCommand extends Command("status") {
  #load = task(this, async (signal) => fetch("/api/status", { signal }).then((r) => r.json()));

  render() {
    void this.#load.run();
    if (this.#load.pending) return text`loading…`;
    return text`status: ${this.#load.value?.state ?? "unknown"}`;
  }
}
```

`task(host, fn)` wraps an async op with reactive `pending`/`value`/`error`/
`aborted` state; each change calls `host.requestUpdate()` so a `render` that
reads `task.value` redraws as the work settles. The runner keeps the process
alive until all of a command's tasks settle (or shutdown aborts them).

## Middleware

A command middleware is the CLI twin of a dom component **provider**: an object
with `install(ctx)` that augments the instance with a typed member — installed
after options are parsed, before `execute`/`render`.

```ts
class Build extends Command({ name: "build", middleware: [logger(), color()] }) {
  execute() {
    this.logger.info(this.color.green("done")); // both typed from the middleware tuple
  }
}
```

`install(ctx)` gets `ctx.options`/`ctx.args`/`ctx.program`, may return a
`Disposable`/`AsyncDisposable`, and can register teardown via `ctx.onCleanup` /
`ctx.use`. Build one with the `contribute` helper. Middleware contributions are
folded into the command's `this` type automatically.

## Plugins, shutdown, terminal UI

- **Plugins** — `plugins: [...]` on the application. A `CliPlugin` gets a
  `PluginHost` (program facts, `addCommand`, the resolved command catalogue) and
  `beforeCommand`/`afterCommand`/`onError` hooks. `specOf(CommandClass)` reads a
  command's resolved `CommandSpec`.
- **Graceful shutdown** — on by default. SIGINT/SIGTERM aborts `this.abortSignal`
  (and the command's tasks), runs teardown LIFO, and exits with the signal's
  conventional code (`130`/`143`). Configure via `shutdown: { signals, timeoutMs,
  onShutdown }`, or `shutdown: false`.
- **Terminal UI** — `box`, `select`, `input`, `alert`, `spinner`, `stepper`
  elements; `flow` control helpers (`when`, `If`, `Switch`, `For`, `While`,
  `map`, `Await`); `text`/`table` templates and `LiveRenderer`; `nodeTerminal` /
  `scriptedTerminal` (+ `decodeKeys`/`key`) for raw-key input.

## API surface

- **`Application(config)` → `App`** — `{ run(argv?), helpText(commandName?) }`.
  Config: `name`, `description`, `version`, `commands`, `options`, `plugins`,
  `shutdown`, `unknownCommandHandler`, and the test seams `autoRun`/`argv`/
  `stdout`/`stderr`/`write`/`tty`/`exit`.
- **`Command(name, config?)` / `Command(config)`** — base class. Instance gets
  typed `options`/`args`, optional `execute`/`render`, `requestUpdate()`,
  `abortSignal`, a per-command `scheduler`, and middleware members.
- **`Option(flag, config?)`**, **`option(flag, config?)`**, **`defaultOptions()`**.
- **`task`**, **`createScheduler`**, **`contribute`**, **`specOf`**.
- **`t`**, **`Infer`** — re-exported from [`@youneed/schema`](../schema).

Built on the [`@youneed/schema`](../schema) decorator/validation layer; shares
the metadata/disposal primitives in [`@youneed/core`](../core).
