# @youneed/vite-plugin

The Vite plugin that makes [`@youneed`](../..) components work under Vite.

## Why you need it

The framework's components use **TC39 standard decorators**
(`@Component.define()`, `@Component.prop()`, …). No browser runs them natively
yet, so they must be transpiled. But **Vite 8 transpiles with oxc**, and neither
oxc nor esbuild (at its default `esnext` target) lowers standard decorators —
they leave `@deco class …` raw, which is a **SyntaxError** in the browser. The
first such module fails to load and takes the whole entry graph down with it
(symptom: a blank page, only static HTML rendered).

This plugin runs **before** Vite's transform and pre-transpiles your `.ts`
sources with esbuild + `supported: { decorators: false }`, handing Vite
decorator-free JS. Works in dev and build.

## Install

```bash
pnpm add -D @youneed/vite-plugin
```

## Use

Add it **first** in `plugins` (before `@vitejs/plugin-react` / `-vue`):

```ts
import { defineConfig } from "vite";
import { domFramework } from "@youneed/vite-plugin";

export default defineConfig({
  plugins: [
    domFramework(),
    // react(), vue(), …
  ],
});
```

## Options

```ts
domFramework({
  // Which modules to pre-transpile.
  // Default: project .ts / .mts / .cts (not .tsx, not node_modules).
  include: (path) => /\.(m|c)?ts$/.test(path) && !path.includes("node_modules"),
  // esbuild target for the decorator lowering. Default: "es2022".
  target: "es2022",
})
```

A cheap regex gates which files are transpiled (those containing a `@deco(`
call); a false positive is harmless — it's just a plain TS→JS pass.

> Not using Vite? Running with `tsx` / `node --import tsx` lowers the decorators
> on its own (it targets the Node version, not `esnext`), so no plugin is needed.

## Example

```bash
pnpm examples:vite:dev    # React + Vue + our framework, one Vite page
```
