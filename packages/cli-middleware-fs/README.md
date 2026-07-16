# @youneed/cli-middleware-fs

Filesystem helpers for [`@youneed/cli`](../cli) commands. Adds `this.fs` —
common read/write/exists/remove calls plus **temp dirs and files that are
removed automatically when the command tears down** (built on the runtime's
disposal). Parent directories are created on write, so generators and scratch
work never leak and never fail on a missing folder.

```ts
import { Command } from "@youneed/cli";
import { fs } from "@youneed/cli-middleware-fs";

class Gen extends Command("gen", { middleware: [fs()] }) {
  async execute() {
    const dir = this.fs.tempDir();             // removed automatically on teardown
    this.fs.writeJson(`${dir}/out.json`, { ok: true });

    if (this.fs.exists("config.json")) {
      const cfg = this.fs.readJson<{ name: string }>("config.json");
      this.fs.writeText("README.md", `# ${cfg.name}\n`);
    }
  }
}
```

## `this.fs`

| Method | Description |
| --- | --- |
| `readText(path)` | Read a file as UTF-8 text. |
| `writeText(path, content)` | Write text (creating parent dirs). |
| `readJson<T>(path)` | Read and `JSON.parse` a file. |
| `writeJson(path, value)` | Write pretty-printed JSON (creating parent dirs). |
| `exists(path)` | Whether a path exists. |
| `remove(path)` | Remove a file or directory (recursive, force). |
| `tempDir(prefix?)` | Create a temp directory, **removed on teardown**. |
| `tempFile(name?)` | Path to a file inside a fresh temp dir (also auto-removed). |

## Exports

- **`fs()`** — the middleware. Adds `this.fs`.
- **`FsApi`** — the `this.fs` surface type.
