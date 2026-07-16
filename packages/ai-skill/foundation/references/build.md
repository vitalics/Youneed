# Build tooling — @youneed/vite-plugin + create-youneedpackage

## @youneed/vite-plugin — TC39 decorators under Vite

youneed components use **TC39 standard decorators** (`@Component.define()`, `@Component.prop()`,
…). No browser runs them natively, so they must be transpiled. **Vite transpiles with oxc**, and
neither oxc nor esbuild (at its default `esnext` target) lowers standard decorators — they leave
`@deco class …` raw, a **`SyntaxError`** in the browser. The first such module fails to load and
takes the whole entry graph down (symptom: **blank page**, only static HTML rendered).

`domFramework()` runs **before** Vite's transform and pre-transpiles `.ts` sources with esbuild
+ `supported: { decorators: false }`, handing Vite decorator-free JS. Dev and build.

```ts
import { defineConfig } from "vite";
import { domFramework } from "@youneed/vite-plugin";

export default defineConfig({
  plugins: [
    domFramework(),        // FIRST — before @vitejs/plugin-react / -vue
    // react(), vue(), …
  ],
});
```
```ts
domFramework({
  include: (path) => /\.(m|c)?ts$/.test(path) && !path.includes("node_modules"),  // default
  target: "es2022",       // esbuild target for the decorator lowering (default)
})
```
A cheap regex gates which files are transpiled (those with a `@deco(` call); a false positive is
harmless (a plain TS→JS pass). **Not using Vite?** `tsx` / `node --import tsx` lowers decorators
on its own (it targets the Node version, not `esnext`) — no plugin needed. For Angular interop
in the same Vite project, scope `@analogjs/vite-plugin-angular` separately (legacy vs TC39
decorators can't share one pass) — see the `youneed-migration` skill's `references/tooling.md`.

## create-youneedpackage — scaffold a new workspace package

Internal, **non-publishable** scaffolder for new `@youneed/*` monorepo packages.
```sh
pnpm create-youneedpackage <name> [description]      # scaffold packages/<name>
pnpm create-youneedpackage                            # interactive (prompts)
```
Creates `packages/<name>/` with:
- `package.json` — `@youneed/<name>`, `dist` outputs, `build` script
- `tsconfig.build.json` — extends the root `tsconfig.base.json`
- `src/index.ts` — public entry stub
- `.npmignore` + `README.md`

…and registers `@youneed/<name>` in the root `tsconfig.base.json` `paths` so the monorepo
resolves it during development. Run `pnpm install` afterwards.

> Because this package is `private`, invoke it via its local workspace bin
> (`pnpm create-youneedpackage`), not `pnpm create youneedpackage` (which would resolve a
> published registry package).

**Gotcha:** adding a new package also means wiring its `tsconfig` paths for any packages that
import it — a known snag when introducing new packages (e.g. orm adapters, pubsub adapters).
