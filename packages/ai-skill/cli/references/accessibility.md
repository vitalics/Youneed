# @youneed/cli — Accessibility & Non-TTY Behaviour

A CLI is consumed by humans on TTYs, screen-reader users, and pipes/CI where
there is no TTY at all. Detect the environment and degrade gracefully. Source:
`packages/cli/src/terminal.ts` plus the color/notification/music/i18n READMEs.

## Colour — `cli-middleware-color` (NO_COLOR / FORCE_COLOR / TTY)

`this.color` styles text, but when colour is disabled **every style becomes the
identity function**, so call sites never branch on support.

```ts
import { color } from "@youneed/cli-middleware-color";
class Build extends Command({ name: "build", middleware: [color()] }) {
  execute() {
    console.log(this.color.green("done"), this.color.bold("✓"));
    if (this.color.enabled) console.log(this.color.background.magenta(" NEW ")); // gate purely-decorative output
  }
}
```

Detection order when `enabled` is omitted: **`--no-color` flag → `NO_COLOR` env →
`FORCE_COLOR` env → `process.stdout.isTTY`**. So honouring `--no-color`, the
`NO_COLOR` standard, and pipes is automatic. `optionKey` (default `color`) sets
which command flag toggles it. Force a state with `color({ enabled })` or build a
surface directly with `createColor(enabled)`.

- **Never encode meaning in colour alone** — pair colour with a glyph/label
  (`✓ done`, not just green). When `this.color.enabled` is false the glyph still
  carries the meaning.

## Non-TTY: reduced, line-oriented output

The live region only patches in place on a TTY; on a pipe/CI it just writes lines.
Make commands work both ways:

- Prefer `execute()` + plain `console.log` for output meant to be piped/grepped;
  reserve animated `render()`/spinners/spectrum for interactive use.
- The `Terminal` abstraction defaults to **80 columns / 24 rows** when size is
  unknown (non-TTY) — don't assume a wide terminal; wrap or keep lines short.
- Gate decorative/animated UI behind `process.stdout.isTTY` (or
  `this.color.enabled`) and fall back to a single status line otherwise.

## Prompts in non-interactive contexts — `cli-middleware-prompt`

Interactive prompts need raw-key input, which a pipe can't give. Provide a
**flag-driven fallback** so the command is scriptable:

```ts
class Setup extends Command({
  name: "setup",
  options: [{ name: "--name <n>" }, { name: "--yes" }],
  middleware: [prompts()],
}) {
  async execute() {
    const name = this.options.name ?? (process.stdin.isTTY ? await this.prompt.ask("Project name?") : "app");
    const ok = this.options.yes || (process.stdin.isTTY && await this.prompt.confirm("Proceed?"));
  }
}
```

Always offer a non-interactive path (a flag or a `--yes`); never block a piped run
waiting for keys that will never arrive. Inject `scriptedTerminal` to test the
interactive path headlessly.

## Notifications — `cli-middleware-notification`

```ts
import { notifications } from "@youneed/cli-middleware-notification";
await this.notify.success("Build complete");      // OS notification (info/success silent; warn/error sound)
```

Delivery via `node-notifier` (an **optional** peer dep, loaded lazily): if absent,
notifications **degrade to a terminal bell** (`bellNotifier()`) rather than
failing. Good for long jobs where the user has switched windows — an out-of-band,
non-visual completion signal. Backend is injectable for tests.

## Audible feedback — `cli-middleware-music`

`this.player` is a deterministic play/pause clock (`elapsed`/`duration`/`progress`/
`ended`); pass `backend: systemPlayer(file)` to also fire real audio. Drive
`tick(dt)` from `scheduler.frame` for a progress visualiser. Treat sound as an
*optional enhancement* alongside the visual transport, never the only channel.

## Localisation — `cli-middleware-i18n`

```ts
import { i18n } from "@youneed/cli-middleware-i18n";
class Greet extends Command({
  name: "greet <name>", options: [{ name: "--locale <l>" }],
  middleware: [i18n({ resources: { en: { hi: "Hello {name}" }, ru: { hi: "Привет {name}" } }, locale: "en" })],
}) {
  execute(name: string) { console.log(this.i18n.t("hi", { name })); } // --locale ru switches before run
}
```

`this.i18n.t(key, vars)` interpolates `{placeholder}`s; the `--locale` flag
switches the active locale **before** the command runs, so one bundle serves every
locale. Keep user-facing strings in the bundle, not hardcoded.

## Checklist

- Pair colour with glyphs/labels; rely on automatic `NO_COLOR`/`--no-color`/TTY detection.
- Offer a flag fallback for every prompt; don't block piped runs on keypresses.
- Assume 80×24 when size is unknown; gate animation behind `isTTY`.
- Notifications/sound are out-of-band extras that degrade silently — never the only signal.
