// A tiny ops CLI built on @youneed/cli, showing off the whole stack:
//
//   pnpm tsx examples/cli/bin.ts setup           # interactive wizard (ask/choice/list/confirm/alert)
//   pnpm tsx examples/cli/bin.ts status          # live table, fills in as checks resolve
//   pnpm tsx examples/cli/bin.ts split a,b,c -f   # options + logger + colour
//   pnpm tsx examples/cli/bin.ts --help
//
// `status` is a live region: each row's latency is a `task`; `render` returns a
// `table` wrapped in a `text` template, and the runtime repaints the changed
// cells in place (cursor control) as each task settles. `setup` is a full TUI
// wizard driven by the prompt middleware — run both in a real terminal.

import { fileURLToPath } from "node:url";
import { Application, defaultOptions } from "@youneed/cli";
import { devtools } from "@youneed/cli-plugin-devtools";
import { DashboardCommand } from "./dashboard";
import { PlayCommand } from "./play";
import { ElementsCommand } from "./elements";
import { SetupCommand } from "./setup";
import { SplitCommand } from "./split";
import { StatusCommand } from "./status";

Application({
  name: "ops",
  description:
    "A tiny ops CLI — music visualiser, dashboard, interactive setup, custom elements, live status",
  version: "1.0.0",
  commands: [
    PlayCommand,
    DashboardCommand,
    SetupCommand,
    ElementsCommand,
    StatusCommand,
    SplitCommand,
  ],
  options: [...defaultOptions()],
  // The devtools plugin registers a `devtools` command (`ops devtools`) that serves
  // the SAME unified <youneed-devtools> shell as the server devtools — a shad-styled
  // command/option builder: pick a command, fill in args/options, Copy or Run it.
  // `launcher` makes the Run button re-launch THIS example through tsx (so workspace
  // deps + the .ts source resolve); the default launcher assumes a compiled binary.
  plugins: [devtools({ launcher: ["pnpm", "exec", "tsx", fileURLToPath(import.meta.url)] })],
});
