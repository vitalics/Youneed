# @youneed/ts-plugin — Template Language Service

A `tsserver` plugin that makes `html``/`css`` template literals first-class in the editor:
completions, hover docs, go-to-definition, and diagnostics. Editor-only — it never runs in
`tsc`. Source: `packages/ts-plugin/src/{index,html,template,component-index}.ts`.

## What it gives you

Inside `` html`...` ``:
- **tag names** — every component (the `Component("tag")` name) + HTML tags;
- **`.prop=`** — only that component's `@Component.prop()` fields, with type + JSDoc;
- **`@event=`** — that component's `@Component.event(...)` names and `this.emit("...")`
  events, plus DOM events;
- **`?attr=` / bare attributes** — booleans and HTML attributes;
- **diagnostics** — `.foo=${}` on a component with no `@Component.prop("foo")` → **error**;
  `@foo=${}` with no matching event → **warning** (emit detection is best-effort);
  unknown/third-party tags are ignored (no false positives).

Inside `` css`...` ``: CSS **property-name** completions in declaration position.

**Hover**: JSDoc + type signature, optional `@preview <url>` image, `@see` links.
**Go-to-definition**: tag → component class; `.prop`/`@event` → the decorator/field.

Data comes from an AST scan (component index), not the type-checker — fast, but
`this.emit(dynamicVar)` and typos inside `emit("…")` may go undetected. Cursor inside a
`${ … }` expression defers to normal TypeScript completions.

## tsconfig.json

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@youneed/ts-plugin",
        "previews": true,            // default true — show @preview images on hover
        "previewDir": "preview",     // default "preview" — screenshot folder beside the component
        "previewCapture": false,     // default false — generate screenshots in background
        "previewCommand": "node generate-previews.mjs"  // optional generation command
      }
    ]
  }
}
```

## VS Code — use the workspace TS version

LS plugins only load under the workspace TypeScript, not VS Code's bundled one.
`.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Then **Command Palette → "TypeScript: Select TypeScript Version" → Use Workspace Version**.
Reload the window after changing `tsconfig` plugins.

## Packaging notes (why the build is shaped that way)

`tsserver` loads plugins via CommonJS `require()`, but the package is ESM. The build emits
`dist/package.json` containing `{"type":"commonjs"}` so `dist/index.js` resolves as CJS.
The plugin source is excluded from the root typecheck (it's an editor tool, not app code).

## Preview engine (optional) — `@youneed/ts-plugin/preview`

Generate a gallery/PNGs of all components (uses `playwright-core` + Chromium for PNG):

```ts
import { defineComponentPreview, serveComponentPreview, runComponentPreview } from "@youneed/ts-plugin/preview";
const cfg = defineComponentPreview({ file: "src/**/*.ts", outDir: "preview" });
await serveComponentPreview(cfg);   // live gallery at http://127.0.0.1:5757
await runComponentPreview({ ...cfg, outDir: "preview" });  // export PNGs
```

## Quick check from the CLI

```bash
pnpm --filter @youneed/ts-plugin watch [tsconfig.json | dir | file.ts …]
```

Prints discovered tags with their props/events and any binding errors as `file:line` —
useful to confirm the index sees your components without opening an editor.

## Gotchas

- Index refreshes on TS Program reparse; an unsaved edit may show stale data until save.
- `@preview` paths resolve relative to the component's file, not the usage site;
  `file://` previews may not render in every editor (Zed) — prefer `https://`.
- Plugins do not run in `tsc` — CI typecheck won't surface template diagnostics.
