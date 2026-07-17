# site — youneed framework landing page

The site is the framework's own showcase: it is **rendered by
`@youneed/ssr`**. Both pages are `Page` classes; the interactive components
(`@youneed/dom`) are pre-rendered to **Declarative Shadow DOM** on the server,
so the package catalog, the docs sidebar and the highlighted code are all in
the HTML before (and without) any JavaScript. Speculation Rules come from
`PageOptions.speculation` via `@youneed/ssr-plugin-speculation`.

## Layout

- `src/pages/main.ts`, `src/pages/docs.ts` — the two Pages (title / meta /
  speculation / clientScript); static sections live in `src/fragments/*.html`,
  page CSS in `public/assets/*.css`.
- `src/components/` — `<yn-package-explorer>` (full catalog, search +
  ecosystem filter), `<yn-docs-nav>` (ecosystem-grouped sidebar, scroll-spy,
  filter debounced through `@youneed/dom-provider-timers`), `<yn-copy>`.
  SSR'd markup hydrates via the client bundles.
- `src/main.ts`, `src/docs.ts` — client entries, bundled by esbuild
  (`scripts/build-client.mjs` → `dist-client/{main,docs}.js`).
- `src/index.ts` — **live SSR server** (`mountPages` on :3000) — the dev flow
  and the "it really renders on the server" demo.
- `scripts/generate.mjs` — **SSG**: `renderPageToString` both pages →
  `dist/` (plus `public/` passthrough and the client bundles). Vercel serves
  `dist` statically.
- `src/data/packages.ts` — **generated** from `packages/*/package.json` by
  `scripts/gen-packages.mjs` (`pnpm site:gen`, part of dev/build).
- `public/` — `tokens.css`, `assets/*.css`, the design variants
  (`index-brutalist.html`, …) and `vercel.json`.

The site lives **outside** the pnpm workspace (like `examples/`): `@youneed/*`
resolve from the root `node_modules`, so every package the site uses must be in
the root `package.json` dependencies.

## Dev / build

```bash
pnpm site:dev      # live SSR server on http://localhost:3000
pnpm site:build    # SSG → site/dist
pnpm site:serve    # zero-dep static preview of site/dist
```

## Deploy to Vercel

```bash
pnpm site:build

# link once per fresh dist (vite/ssg builds wipe it):
cd site/dist && npx vercel link --yes --project youneed --scope vitaliharadkous-projects
rm -f .env.local   # the link drops an OIDC token file — do not deploy it

npx vercel deploy --prod --yes
```
