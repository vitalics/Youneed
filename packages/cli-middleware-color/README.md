# @youneed/cli-middleware-color

Terminal **colour & styling** for [`@youneed/cli`](../cli) commands. Adds
`this.color` — a set of chalk-style style functions. Each style uses its own
ANSI close code (not a blanket reset), so nesting composes:
`this.color.bold(this.color.red("x"))` stays bold *and* red. When colour is
disabled — `NO_COLOR`, `--no-color`, or a non-TTY stdout — every style is the
identity function, so call sites never branch on support.

```ts
import { Command } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";

class Build extends Command({ name: "build", middleware: [color()] }) {
  execute() {
    console.log(this.color.green("done"), this.color.bold(this.color.cyan("✓")));
    if (this.color.enabled) console.log(this.color.background.magenta(" NEW "));
  }
}
```

## `this.color`

- **Palette** (foreground): `black`, `red`, `green`, `yellow`, `blue`,
  `magenta`, `cyan`, `white`, plus greys `gray` / `grey`.
- **Modifiers**: `reset`, `bold`, `dim`, `italic`, `underline`, `inverse`,
  `strikethrough`.
- **`background`** — the same palette as background colours
  (`this.color.background.magenta("…")`).
- **`enabled`** — whether styling is actually emitted (`false` ⇒ every style is identity).

Each style is `(text: string) => string`.

## Options

`color(options?)`:

- `enabled` — force colour on/off. When omitted, detection is used:
  `--no-color` → `NO_COLOR` env → `FORCE_COLOR` env → `process.stdout.isTTY`.
- `optionKey` — the command option inspected for an explicit toggle. Default
  `color` (so a `--no-color` / `--color` flag on the command is honoured).

## Exports

- **`color(options?)`** — the middleware. Adds `this.color`.
- **`createColor(enabled)`** — build a `Color` surface for a known state directly.
- Types: `Color`, `ColorPalette`, `ColorOptions`, `Style`.
