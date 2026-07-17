# site — youneed framework landing page

The site is built with the stack it documents: `@youneed/dom` components,
bundled by **Vite** via `@youneed/vite-plugin` (which lowers the TC39
decorators Vite's oxc/esbuild leave raw).

- `index.html` — the landing page. The full package catalog under `#packages`
  is `<yn-package-explorer>`, a `@youneed/dom` component with search +
  ecosystem filter over data generated from `packages/*/package.json`.
- `docs/index.html` — the docs. The sidebar is `<yn-docs-nav>` (grouped by
  ecosystem: dom / server / ssr / cli, with scroll-spy and a filter box built
  in — the filter is debounced through `@youneed/dom-provider-timers`, the
  provider the docs describe); copy buttons are `<yn-copy>`; new code blocks
  are highlighted at runtime (`data-hl`).
- `src/` — the TypeScript entries and components.
- `src/data/packages.ts` — **generated**; rebuild with `pnpm site:gen`
  (also runs automatically in `site:dev` / `site:build`).
- `public/` — passthrough assets: `tokens.css`, the design variants
  (`index-brutalist.html`, `index-atmospheric.html`, `index.old.html` +
  `support.js`, the old dc-runtime), and `vercel.json`.

The site lives **outside** the pnpm workspace (like `examples/`): `@youneed/*`
and `vite` resolve from the root `node_modules`, and `vite.config.ts` aliases
`@youneed/dom` to its TypeScript source — no package build needed.

## Local dev / build

```bash
pnpm site:dev      # Vite dev server (regenerates the package data first)
pnpm site:build    # → site/dist
pnpm site:serve    # zero-dep static preview of site/dist
```

## Deploy to Vercel

Build first, then deploy the `dist` output (its `vercel.json` — copied from
`public/` — sets clean URLs + cache/security headers):

```bash
pnpm site:build

# one-off / preview
npx vercel deploy site/dist --yes

# production
npx vercel deploy site/dist --prod --yes
```

Non-interactive (CI / token): `npx vercel deploy site/dist --prod --yes --token=$VERCEL_TOKEN`.
