---
name: youneed-ssr
license: ISC
description: "Server-side rendering and static generation in the youneed framework: rendering @youneed/dom web components to HTML on the server (@youneed/ssr — renderToString/renderToStream as Declarative Shadow DOM, the document-level Page entity, mountPages), the ssr() ServerPlugin (@youneed/server-plugin-ssr) that owns the page list, client hydration + SPA navigation with @youneed/dom-router (createRouter, outlet() partial routing) and @youneed/ssr-router Error/404 pages, static site generation (renderPageToString / renderPage to HTML files, mode: \"ssg\"), and the SEO satellite SSR modules robots/sitemap/rss/llms/structured-data. This skill should be used when adding SSR or SSG to a youneed app, hydrating SSR'd components, wiring SSR routing, or emitting robots.txt/sitemap.xml/rss.xml/llms.txt/JSON-LD."
---

# youneed — SSR & SSG

Server-render `@youneed/dom` components to HTML (as native **Declarative Shadow
DOM**, so markup hydrates without a framework runtime), the document-level
`Page` entity, the `ssr()` server plugin, client hydration + SPA routing, static
generation, and the SEO satellite modules.

Source of truth — verify a signature before asserting it:
`packages/ssr/src/{dom-ssr,page}.ts`, `packages/server-plugin-ssr/src/index.ts`,
`packages/ssr-router/src/index.ts`, `packages/dom-router/src/dom-router.ts`,
`packages/dom/src/register.ts`, and `examples/{ssr,pages,ssg,video}`.

| Task | Read |
|------|------|
| SSR end-to-end: registerDOM, renderToString/Stream, Page, mountPages, hydration, SSR routing + outlet() | `references/ssr.md` |
| Static generation (renderPage/renderPageToString to files, `mode: "ssg"`) + SEO modules robots/sitemap/rss/llms/structured-data | `references/ssg.md` |

## At a glance — render a component (SSR)

```ts
import { registerDOM } from "@youneed/dom/register";
registerDOM();                                   // happy-dom; BEFORE importing components
const { renderToString } = await import("@youneed/ssr");

renderToString(MyComponent);     // "<my-el><template shadowrootmode=open>…</template></my-el>"
```

## At a glance — Pages via the ssr() plugin

```ts
import { Application } from "@youneed/server";
import { ssr } from "@youneed/server-plugin-ssr";
import { Page } from "@youneed/ssr";
import { robots } from "@youneed/ssr-plugin-robots";
import { sitemap } from "@youneed/ssr-plugin-sitemap";

class Home extends Page("/", { title: "Home", clientScript: () => import("./client.ts") }) {
  render() { return HomeApp; }                    // a component class, instance, or HTML string
  @Page.get("/stats") stats(ctx) { return this.json({ online: 100 }); }
}

Application()
  .plugin(ssr({
    origin: "https://example.com",
    pages: [Home],
    modules: [robots({ sitemap: true }), sitemap()],
  }))
  .listen(3000, () => {});
```

## Ground rules (SSR-specific)

- **`registerDOM()` first.** `@youneed/dom` classes `extends HTMLElement` at import,
  so a Node DOM (happy-dom, encapsulated) must exist before importing `@youneed/ssr`
  or components. Always go through `@youneed/dom/register` — never `GlobalRegistrator`
  directly. Idempotent; a no-op when a real DOM already exists.
- **Two ways to mount pages, pick one.** `mountPages(app, ...Pages)` wraps the server
  into an SSR host; `ssr({ pages, modules })` inverts it — SSR is a `ServerPlugin` the
  server opts into, and the plugin owns the page list (the single route-table source
  the satellite modules enumerate). Prefer the plugin when you also want satellites.
- **Render output is Declarative Shadow DOM** (`<template shadowrootmode="open">`) with
  `adoptedStyleSheets` inlined as `<style>` — it hydrates natively, no SSR-shim runtime.
- **SSG is real** but file-based: render once with `renderPage`/`renderPageToString` and
  write the HTML, or set a Page's `mode: "ssg"` to render-once-then-replay. There is no
  crawler/route-walker that emits a whole site — you drive the page list yourself.
- **Satellite modules are NOT server plugins.** robots/sitemap/rss/llms/structured-data
  implement the `SsrModule` contract and run inside `ssr({ modules: [...] })`.

## Answering style

- Show the `registerDOM()` → dynamic-`import` ordering whenever Node-side rendering is involved.
- Name the exact export and package (`renderToString` from `@youneed/ssr`,
  `ssr` from `@youneed/server-plugin-ssr`, `createRouter`/`outlet` from `@youneed/dom-router`).
- For SSG, be honest: it's "render a Page to a string and write a file" or `mode: "ssg"`,
  not a magic build step. Show the actual `writeFileSync` / `renderPageToString` path.
