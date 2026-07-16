# site — youneed framework landing page

Static landing page for the youneed framework, imported from the Claude Design
project **"Youneed framework landing page"**.

- `index.html` — the landing page (a `.dc.html` design-compiler document: an
  `<x-dc>` template rendered by `support.js`).
- `docs/index.html` — the package documentation site (sidebar nav + per-package
  pages, highlight.js code blocks). Same `.dc.html` runtime; served at `/docs`.
- `support.js` — the `dc-runtime`: it self-loads React/ReactDOM from unpkg and
  mounts the `<x-dc>` template. No build step — pure static. (Copied into `docs/`
  too so the docs page resolves `./support.js`.)

## Local preview

Any static server works (the runtime fetches React from a CDN, so open over
HTTP, not `file://`):

```bash
npx serve site          # or: python3 -m http.server -d site 8080
```

## Deploy to Vercel

Pure static — no build. `vercel.json` sets clean URLs + cache/security headers.

```bash
# one-off / preview
npx vercel deploy site --yes

# production
npx vercel deploy site --prod --yes

# link this dir to a Vercel project first (interactive):
cd site && npx vercel link
```

Non-interactive (CI / token): `npx vercel deploy site --prod --yes --token=$VERCEL_TOKEN`.
