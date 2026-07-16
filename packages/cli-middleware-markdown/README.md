# @youneed/cli-middleware-markdown

Render Markdown to terminal output for [`@youneed/cli`](../cli) commands. Install
the middleware and your command gains **`this.markdown(md)`** — give it a Markdown
string, get back ANSI-styled text: headings, **bold**/*italic*, inline `code`,
fenced code blocks, lists, block-quotes, horizontal rules and links. It's
line-oriented and dependency-free — enough to pretty-print help text, release
notes, changelogs and docs straight in the terminal.

```ts
import { Application, Command } from "@youneed/cli";
import { markdown } from "@youneed/cli-middleware-markdown";

class Readme extends Command("readme", { middleware: [markdown()] }) {
  execute() {
    console.log(
      this.markdown("# Title\n\nSome **bold** text and a `code` span.\n\n- one\n- two"),
    );
  }
}

Application({ name: "docs", commands: [Readme] });
```

## `this.markdown(md)`

A function `(md: string) => string` that returns ANSI-styled terminal text.
Supported syntax:

- **Headings** (`#`…`######`) — bold; level 1–2 also underlined.
- **Inline** — `**bold**`, `*italic*`, `` `code` `` (inverse), `[text](url)`.
- **Lists** — `-`/`*`/`+` bullets rendered with `•`.
- **Block-quotes** — `>` lines prefixed with a dim bar.
- **Fenced code** — ` ``` ` blocks rendered dim, verbatim.
- **Rules** — `---`/`***`/`___` rendered as a divider line.

## Exports

- **`markdown()`** — the middleware factory. Contributes `this.markdown`.
- **`renderMarkdown(md)`** — the underlying renderer, exported standalone for use
  outside a command (the same function `this.markdown` calls).
- **`Markdown`** — type of the `this.markdown` surface (`(md: string) => string`).
