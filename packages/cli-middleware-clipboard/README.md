# @youneed/cli-middleware-clipboard

Read from and write to the **system clipboard** in a [`@youneed/cli`](../cli)
command. Adds `this.clipboard` with `write` / `read`, which shell out to the
platform clipboard tool (`pbcopy`/`pbpaste` on macOS, `xclip`/`xsel` on Linux,
`clip`/PowerShell on Windows). It's best-effort: if no tool is available the
calls resolve quietly rather than throwing.

```ts
import { Command } from "@youneed/cli";
import { clipboard } from "@youneed/cli-middleware-clipboard";

class Token extends Command("token", { middleware: [clipboard()] }) {
  async execute() {
    const t = generate();
    await this.clipboard.write(t);
    console.log("copied to clipboard");
  }
}
```

## `this.clipboard`

- **`write(text)`** → `Promise<void>` — put `text` on the clipboard.
- **`read()`** → `Promise<string>` — read the clipboard contents (`""` if unavailable).

## Options

`clipboard(options?)`:

- `backend` — replace the clipboard implementation. Pass an in-memory `Clipboard`
  to make commands testable without touching the real system clipboard.

## Exports

- **`clipboard(options?)`** — the middleware. Adds `this.clipboard`.
- **`systemClipboard()`** — build the default OS-backed `Clipboard` directly.
- **`Clipboard`**, **`ClipboardOptions`** — types.
