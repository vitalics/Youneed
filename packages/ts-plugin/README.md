# @youneed/ts-plugin

A TypeScript **language-service plugin** that adds editor completions inside the
`html`…`` and `css`…`` tagged templates of [`@youneed/dom`](../dom) — including
ones that know about *your* components:

- **tag names** — every custom element defined via `Component("tag-name", …)`;
- **`.prop=`** — the element's `@Component.prop()` fields (with their types);
- **`@event=`** — the element's events: `@Component.event("name")`, exposed-event
  fields, and any `this.emit("name", …)` it fires — plus common DOM events;
- **bare attribute** — the punctuated `.prop` / `@event` forms + common attributes;
- **`css`` properties** — common CSS property names in a declaration position.

Completions are skipped (deferred to normal TS) when the cursor is inside a `${…}`
expression, so you keep full IntelliSense there.

## Type-safe bindings (diagnostics)

Beyond completions, the plugin **checks** `.prop` / `@event` bindings on known
components and reports squiggles:

- `.foo=${…}` / `?foo=${…}` on a component without a `@Component.prop` named `foo`
  → **error**;
- `@foo=${…}` on a component that doesn't expose an event `foo` (and isn't a common
  DOM event) → **warning** (event detection can be incomplete, so it's a nudge).

Unknown tags (plain HTML, third-party elements) are left alone — no false
positives. This is editor-level safety (lit-analyzer / Angular-LS style); `tsc`
itself doesn't run language-service plugins.

## Audits — pluggable diagnostics

Diagnostics are contributed by **audits**: each is a module loaded from the
`audits` list, given its own options. The plugin runs them per file and merges
their findings as squiggles. An audit picks its severity, so the same check can be
an `"error"` here and a `"warning"` there (or `"none"` to silence it).

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@youneed/ts-plugin",
        "audits": [
          ["@youneed/ts-plugin/dom", {
            "unusedCss": { "enabled": true, "kind": "error" },
            "preview":   { "dir": "preview", "capture": true, "command": "node generate-previews.mjs" }
          }],
          ["@youneed/dom-provider-a11y/ts-plugin", {
            "reduceMotion": { "enabled": true, "kind": "warning" },
            "colorScheme":  { "enabled": true, "kind": "warning" }
          }]
        ]
      }
    ]
  }
}
```

Built-in **`@youneed/ts-plugin/dom`** contributes:

| check | default | flags |
|---|---|---|
| `bindings` | on (prop=error, event=warning) | `.prop` / `@event` not on the component (the section above) |
| `unusedCss` | off | a `css`` ` class selector never referenced anywhere in the file |
| `preview` | — | not a diagnostic: hover screenshots (read by the plugin core — see below) |

Any package can ship an audit by exporting an `AuditFactory` (`(options) => Audit |
Audit[]`) — see [`@youneed/ts-plugin/audit`](./src/audit.ts) for the contract.
[`@youneed/dom-provider-a11y/ts-plugin`](../dom-provider-a11y) is one such external
audit: it statically checks a component's `css`` ` for a `reduceMotion` variant and
`colorScheme` awareness. An audit module is loaded with a synchronous `require`, so
it must be **CommonJS**.

> With no `audits` the plugin still provides completions, hover and
> go-to-definition — but no diagnostics and no hover previews. The binding checks
> aren't built in: declare `["@youneed/ts-plugin/dom", …]` to turn them on.

## How it works

It scans the program's source for `@youneed/dom` components (a class whose
`extends` clause calls `Component("tag", …)`), building a `tag → { props, events }`
index. Inheritance is followed (`Component("tag", BaseComponent)` and plain
`extends`). A tiny HTML/CSS scanner figures out the cursor context inside the
template (treating `${…}` holes as opaque) and emits the matching completions.

The completion logic lives in small **pure modules** (`component-index`,
`template`, `html`, `css`) that are unit-tested headlessly with the bare
`typescript` API — see `tests/completions.test.ts`. `index.ts` is the thin
tsserver adapter that wraps the language service.

## Enable it

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [{ "name": "@youneed/ts-plugin" }]
  }
}
```

## Watch it work (no editor needed)

To see, in real time, exactly what the plugin "sees" — the component index it
builds and the binding squiggles it would draw — run the live inspector:

```sh
pnpm --filter @youneed/ts-plugin watch [tsconfig.json | dir | file.ts …]
```

- **no args** → `./tsconfig.json` if present, else every `*.ts` under the cwd;
- **a `tsconfig.json`** → watch that project (new files included);
- **a directory** → watch every `*.ts` under it;
- **one or more `.ts`** → watch just those files.

It reprints on every save: each `<tag>` with its `.props` / `@events` (and where
it's declared), then the `.prop` / `@event` binding errors and warnings with
`file:line`. It runs the *same* pure modules the editor plugin runs, driven by
`ts.createWatchProgram`, so it's a faithful, editor-free way to inspect the plugin
(it's a dev tool, excluded from the published `dist`).

## Component preview (`@youneed/ts-plugin/preview`)

The package also ships the preview engine — import it anywhere to render your
components, either as a **live dev-server** or to **PNG** artifacts:

```js
import { defineComponentPreview, serveComponentPreview, runComponentPreview }
  from "@youneed/ts-plugin/preview";

const config = defineComponentPreview({
  file: "./src/components.ts",      // entry that registers your @youneed/dom components
  generate(c) {                     // optional: per-component props/markup/skip/width
    if (c.tag === "todo-item") return { props: { text: "Buy milk" } };
  },
});

await serveComponentPreview(config);          // live gallery at http://127.0.0.1:5757
// or: await runComponentPreview({ ...config, outDir: "preview" });  // → preview/<tag>.png
```

`esbuild` and `typescript` are needed for the server; `playwright-core` (+ a
Chromium) additionally for the PNG mode — all optional peers, resolved from your
project. See [`examples/ts-plugin-demo`](../../examples/ts-plugin-demo) for a full
config and the editor-hover integration.

## Enable it in your editor

Then, in VS Code, select the **workspace** TypeScript version
(`TypeScript: Select TypeScript Version → Use Workspace Version`) so the editor's
tsserver loads the plugin. (Plugins run only in the editor's language service, not
in `tsc`.)

> Packaging note: tsserver loads plugins with `require()`, so the build emits
> **CommonJS** (`dist/package.json` pins `{"type":"commonjs"}` even though the
> source package is ESM for dev/test ergonomics).
