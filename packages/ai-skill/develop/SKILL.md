---
name: youneed-develop
description: "Developer-experience tooling for the youneed framework: wiring up @youneed/devtools (runtime component inspector — tree, props history/time-travel, emitted events, live scheduler swap, style editing) and @youneed/ts-plugin (TypeScript language-service plugin giving autocomplete, hover docs, go-to-definition and squiggle diagnostics inside html`` and css`` templates). This skill should be used when setting up, configuring, debugging, or explaining the youneed devtools panel or the ts-plugin editor integration."
license: ISC
---

# youneed — Developer Tooling

Two packages improve the day-to-day DX of building with `@youneed/dom`. Both are
opt-in and zero-cost when absent. Source of truth: `packages/devtools/src/*`,
`packages/ts-plugin/src/*`, and each package's `README.md` — verify a signature there
before asserting it.

| Task | Read |
|------|------|
| Install / mount the runtime inspector panel; inspect props, events, scheduler, styles | `references/devtools.md` |
| Configure the TS language-service plugin; autocomplete/diagnostics in `html``/`css`` | `references/ts-plugin.md` |

## At a glance

- **@youneed/devtools** — a floating inspector panel (browser/DOM only). Call
  `installDevtools()` *before* components mount, optionally `mountDevtoolsPanel()`.
  Hooks into `@youneed/dom` via a global `__DOM_DEVTOOLS__` hook; when not installed,
  the DOM hot path does a single null-check and skips all capture. Import it
  conditionally (`import.meta.env.DEV`) so it tree-shakes out of production.
- **@youneed/ts-plugin** — a `tsserver` plugin registered in `tsconfig.json`
  `compilerOptions.plugins`. Indexes components by AST (tag, `@Component.prop`,
  `@Component.event`, `this.emit(...)`) and powers completions, hover (with optional
  `@preview` images), go-to-definition, and `.prop`/`@event` validation inside template
  literals. Editor-only — it does **not** run in `tsc`. Needs the workspace TS version
  in VS Code, and ships a CJS build (`dist/package.json` `{"type":"commonjs"}`).

## Answering style

- Give the exact import + call site (and *where* it runs — browser vs editor).
- For devtools, always pair the snippet with the dev-only guard so it can't ship to prod.
- For ts-plugin, give the concrete `tsconfig.json` / `.vscode/settings.json` blocks and
  remind to select the workspace TypeScript version.
