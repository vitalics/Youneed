# example: @youneed/ts-plugin in your editor

Shows the language-service plugin's completions, **JSDoc in the completion popup**,
**hover**, **go-to-definition**, and type-safe-binding diagnostics on real
`@youneed/dom` components — see [`demo.ts`](./demo.ts).

⌘/Ctrl-click (or "Go to Definition") on a tag, a `.prop`, or an `@event` inside a
template jumps to the component class / `@Component.prop()` field / the declaring
`@Component.event()` member — even when the event name differs from the member
name, and across inheritance (an inherited prop lands in the base component file).

The JSDoc comes from the `/** … */` written on each `@Component.prop()` /
`@Component.event()` declaration in the component (not on the handler you bind in
the parent). Highlight a `.prop` / `@event` entry in the completion list and that
description shows in the details panel.

Built-in entries (standard DOM events like `@click`, HTML attributes like `class`,
HTML tags) instead show a "Standard …" note plus an **MDN reference link** — so
it's clear they aren't component members and you can jump to the docs.

The same info appears on **hover**: point at a `.prop` / `@event` binding in a
template and you get its type + JSDoc (or the standard-DOM + MDN note). Hovering
the **tag name** itself (`<todo-item>`) shows the component's class JSDoc;
standard tags (`<div>`, …) show the MDN element link. Hovering inside a `${…}`
value defers to TypeScript's own quick-info.

The component's class JSDoc also shows in the **tag completion** popup (type
`<to` and highlight `todo-item`).

### Live preview — the fast dev loop (recommended)

When you're **developing** a component, don't wait for the screenshot cycle. Start
the live dev-server and edit with instant feedback:

```bash
node generate-previews.mjs --serve            # → http://127.0.0.1:5757
node generate-previews.mjs --serve --port 8080
```

It opens a browser **gallery** that mounts every component (using the same
`generate()` hook for props/markup), and on **every save** it re-bundles
incrementally with esbuild and reloads the page over an SSE channel — a real,
interactive render in tens of milliseconds, not a static screenshot. No Chromium,
no PNGs. This is the loop to use while building; the PNG modes below exist only to
(re)generate the committed artifacts the editor hover shows.

### Hover previews — real component screenshots

Hovering a component's tag can show an actual screenshot of the rendered
component. The image is **real**, produced by a generator, then **auto-discovered**
by the plugin at `‹component-dir›/‹previewDir›/‹tag›.png`:

```bash
# render every component in demo.ts to preview/<tag>.png (headless Chromium)
node generate-previews.mjs
```

`generate-previews.mjs` is a small **config**, authored like an esbuild / vite
plugin — `defineComponentPreview({ file, outDir, generate })` — and run by the
engine that ships with the plugin (`@youneed/ts-plugin/preview`):

```js
import { defineComponentPreview } from "@youneed/ts-plugin/preview";

export default defineComponentPreview({
  file: resolve(here, "demo.ts"),
  outDir: resolve(here, "preview"),
  generate(c) {
    // c = { tag, className, doc, see, props: [{ name, type, doc }] }
    if (c.tag === "todo-item") return { props: { text: "Buy milk", done: true } };
    return {}; // fall back to props auto-sampled from their types
  },
});
```

The `generate(c)` hook controls each component's render — return `{ props }`,
`{ html }` (raw markup), `{ skip: true }`, or `{ width, wait }`. The engine bundles
the entry with esbuild, mounts each component in headless Chromium
(`playwright-core`), and saves the PNG. If Chromium isn't installed it prints
`npx playwright install chromium`; you can also point at an existing build with
`PW_CHROMIUM_PATH=…` (or `executablePath` in the config).

**Refreshing a stale preview.** The PNG is a generated artifact — the plugin
doesn't re-render it. After changing a component, re-run the generator:

```bash
node generate-previews.mjs            # one-shot
node generate-previews.mjs --watch    # re-render on every entry-file change
```

The plugin cache-busts the image URL by file mtime, so a re-render shows up in the
hover (otherwise editors keep the cached image for the same `file://` URL; if it
still looks stale, reload the editor window).

> What's *in* the preview comes from the `generate()` hook, not the component's
> defaults — e.g. `todo-item` renders with `text: "Buy milk"` because the hook sets
> it. To change the rendered label, edit the hook (or return nothing to auto-sample
> props from their types).

The **hover** image is a static screenshot, not a live render — an LS hover is
plain markdown and can't execute JS. For a live, interactive render use
`--serve` (above); the PNG is just the editor-hover artifact.

**Plugin options** (on the tsconfig `plugins` entry — see this folder's
`tsconfig.json`) let you turn it all off:

| option | default | meaning |
|---|---|---|
| `previews` | `true` | show auto-discovered screenshots on hover (`false` = off, incl. Playwright) |
| `previewDir` | `"preview"` | dir (next to the component's source file) holding `‹tag›.png` |
| `previewCapture` | `false` | also run `previewCommand` in the **background** when a screenshot is missing |
| `previewCommand` | — | the generator command for `previewCapture` |

Two JSDoc tags add to the hover too:

- **`@see <url|text>`** → a clickable "See:" link. Standard JSDoc, renders in
  **both VS Code and Zed**, no hosting. Good for docs / Storybook references.
- **`@preview <url>`** → an explicit image that **overrides** auto-discovery (use a
  hosted `https://` screenshot for reliable rendering; local `file://` images are
  often blocked by the editor and Zed shows few images in hovers).

## Build the plugin once

Editors load the plugin's compiled output (`dist/`), so build it first:

```bash
pnpm --filter @youneed/ts-plugin build
```

(`pnpm build` at the repo root also builds it.)

> **Why this folder has its own `package.json`:** tsserver only auto-loads a
> tsconfig `plugins` entry when that plugin is declared as a **dependency** of the
> project. So `package.json` lists `@youneed/ts-plugin` (and `@youneed/dom`). The
> modules resolve from the repo-root `node_modules` — this folder isn't a pnpm
> workspace member, so no install is needed here. Without this `package.json` the
> plugin silently won't load.

## VS Code

The plugin is declared in `tsconfig.base.json` (`plugins`). **VS Code loads a
tsconfig plugin only under the WORKSPACE TypeScript** — with its bundled TS it
resolves plugins only from extension paths, never the project's `node_modules`,
so the plugin is silently "Couldn't find" (visible in the TS Server log).

1. Open `examples/ts-plugin-demo/demo.ts` (this folder's `.vscode/settings.json`
   points `typescript.tsdk` at the repo-root TypeScript and prompts to use it).
2. Run **“TypeScript: Select TypeScript Version” → “Use Workspace Version”**
   (5.9.2), then reload the window.

Simplest alternative: open the **repo root** in VS Code instead of this subfolder
— the root `.vscode/settings.json` already selects the workspace TS — then open
`examples/ts-plugin-demo/demo.ts`.

Confirm via **“TypeScript: Open TS Server Log”**: you want
`Loading @youneed/ts-plugin from …/di-framework/…` succeeding (not "Couldn't
find"), then `[youneed/ts-plugin] initialized`.

## Zed

The repo's `.zed/settings.json` registers the plugin with Zed's TypeScript server
(`vtsls`) via `tsserver.globalPlugins`. Just open the repo in Zed and open
`demo.ts`. (If it doesn't activate, make `location` an absolute path to the repo
root.)

## What to try in `demo.ts`

Inside the `html\`…\`` templates:

| type this | you get |
| --- | --- |
| `<`  | tag completion → `<todo-item>`, `<todo-app>`, `<status-pill>` |
| `<todo-item .` | prop completion → `text`, `done` |
| `<status-pill .` | prop completion → `label` |
| `<todo-item @` | event completion → `onToggle`, `onRemove` + common DOM events |
| `<todo-item .txet=${…}>` | **error** squiggle: `txet` is not a prop |
| `<todo-item @onTaggle=${…}>` | **warning** squiggle: `onTaggle` is not an event |
| the `.legacy { … }` rule in `<status-pill>`'s `css\`\`` | **error** squiggle: unused CSS class (the `unusedCss` audit) |

`demo.ts` already contains those “wrong” bits so you see the squiggles immediately.
They don't break `tsc`/`pnpm typecheck` — language-service plugins are editor-only.

### Audits (this folder's `tsconfig.json`)

The diagnostics above come from **audits** configured in `tsconfig.json`'s plugin
entry — each `[moduleSpecifier, options]` loads a check provider:

```jsonc
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
```

`<status-pill>` keeps its `@media (prefers-reduced-motion)` / `@media
(prefers-color-scheme)` blocks, so the a11y audit is quiet — **delete one** and a
warning appears on the matching `transition` / `color` declaration. (This is the
editor-time, static mirror of the runtime `a11yProvider({ audit: true })` below.)

## A11y CSS audit (`<status-pill>`)

`demo.ts` also defines `<status-pill>` from
[`@youneed/dom-provider-a11y`](../../packages/dom-provider-a11y), configured with
`a11yProvider({ audit: true })`. It ships both adaptive CSS variants
(`@media (prefers-reduced-motion: reduce)` and `@media (prefers-color-scheme: dark)`),
so the audit is quiet.

To see it fire, run the live preview, open the browser console, and delete one of
those `@media` blocks in `demo.ts`:

```bash
node generate-previews.mjs --serve   # http://127.0.0.1:5757
```

The provider then warns (with an MDN link) that the component animates without a
reduced-motion variant, or sets colors without being `color-scheme`-aware.

## Troubleshooting

- **Nothing happens in VS Code** → you're on VS Code's bundled TS; switch to the
  workspace version (step 2) and reload the window.
- **Nothing in Zed** → check the vtsls log; ensure `dist/` is built and the
  `location` in `.zed/settings.json` resolves `@youneed/ts-plugin`.
- The plugin logs to the TS Server log (`[youneed/ts-plugin] initialized`).
