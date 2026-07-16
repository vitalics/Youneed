# youneed — SSG & SEO Satellite Modules

Static generation and the SEO endpoints (robots/sitemap/rss/llms/structured-data).
Source: `packages/ssr/src/{dom-ssr,page}.ts`, `examples/ssg/generate.ts`,
`packages/ssr-plugin-{robots,sitemap,rss,llms,structured-data}/src/index.ts`,
`packages/server-plugin-ssr/src/index.ts`.

## Is SSG a real feature?

**Yes, but it is file-/render-based, not a crawler.** There is no build step that walks
your route graph and emits a whole site. SSG = render a Page (or component) to an HTML
string and write it, OR mark a Page `mode: "ssg"` so it renders once at runtime and
replays the cached HTML. You drive the page list. Three honest paths:

### A. Component → static HTML file (`renderPage`)

```ts
// examples/ssg/generate.ts — run after bundling the client
import { registerDOM } from "@youneed/dom/register";
import { writeFileSync } from "node:fs";
registerDOM();

const { renderPage } = await import("@youneed/ssr");
const { CounterApp } = await import("./app.ts");

const html = renderPage(CounterApp, { title: "SSG counter", clientScript: "./app.js" });
writeFileSync("./index.html", html);   // a static, hydratable index.html
```

### B. Page → static HTML string (`renderPageToString`)

```ts
import { renderPageToString, routeTable } from "@youneed/ssr";

const pages = [Home, About, Pricing];
const routes = routeTable(pages);                        // full table for devtools payload
for (const P of pages) {
  const html = await renderPageToString(P, { request: { url: P.url } } as any, routes);
  writeFileSync(`./dist${P.url === "/" ? "/index" : P.url}.html`, html);
}
```

`renderPageToString(PageCls, ctx?, routes?)` fakes the `ctx` (no live request) — pass
overrides if `render()` reads from it.

### C. Render-once-then-replay at runtime (`mode: "ssg"`)

```ts
class Home extends Page("/", { title: "Home", mode: "ssg" }) { render() { return HomeApp; } }
```

A Page's render `mode`:
- `"ssr"` (default) — re-render the document on every request.
- `"ssg"` — render once on the first hit, then replay the cached HTML (in-memory).
- `"client"` — emit the shell only; the browser renders the body (`render()` not called server-side).

## SEO satellite SSR modules

Run inside `ssr({ modules: [...] })`. They are **not** server plugins — each implements
`SsrModule { name, setup(ctx), inspect?() }` and receives `SsrModuleContext`:
`app` (register routes), `origin`, `routes` (`{url,title,dynamic}` — `dynamic` ones are
skipped by sitemaps/feeds), `absolute(path)` (resolve against origin), `head(fn)`
(contribute to every page `<head>`). The plugin's page list is the single route-table source.

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { robots } from "@youneed/ssr-plugin-robots";
import { sitemap } from "@youneed/ssr-plugin-sitemap";
import { rss } from "@youneed/ssr-plugin-rss";
import { llms } from "@youneed/ssr-plugin-llms";
import { structuredData, organization, website } from "@youneed/ssr-plugin-structured-data";

ssr({
  origin: "https://example.com",
  pages: [Home, About, BlogPost],
  modules: [
    robots({ sitemap: true,                                  // → /robots.txt
      policies: [{ userAgent: "*", disallow: "/admin", crawlDelay: 1 }] }),
    sitemap({ defaults: { changefreq: "weekly", priority: 0.8 },  // → /sitemap.xml
      exclude: [/^\/draft/],                                 // includePages: true by default
      entries: (c) => loadPosts().map((p) => ({ url: `/blog/${p.slug}`, lastmod: p.date })) }),
    rss({ title: "Blog", description: "Latest", format: "rss", // → /rss.xml ("atom" → /atom.xml)
      items: async (c) => (await loadPosts()).map((p) => ({ title: p.title, link: `/blog/${p.slug}`, pubDate: p.date })) }),
    llms({ title: "Example", summary: "What we do", includePages: true }),  // → /llms.txt
    structuredData({ schemas: [organization({ name: "Example" }), website({ url: "https://example.com" })] }),
  ],
});
```

### Module reference

| Module | Default path | Emits | Key options |
|--------|--------------|-------|-------------|
| `robots()` | `/robots.txt` | `text/plain` | `policies[]` (`userAgent`/`allow`/`disallow`/`crawlDelay`), `sitemap` (string\|array\|`true`→`/sitemap.xml`), `host`, `path` |
| `sitemap()` | `/sitemap.xml` | `application/xml` urlset | `includePages` (def `true`), `exclude` (string\|RegExp), `entries` (array\|async fn), `defaults`, `path` |
| `rss()` | `/rss.xml` (atom: `/atom.xml`) | `application/xml` | `title`, `description` (required), `format` (`"rss"`\|`"atom"`), `link`, `language`, `items` (array\|async fn), `path` |
| `llms()` | `/llms.txt` | `text/plain` markdown | `title` (required `# H1`), `summary` (`> quote`), `notes[]`, `sections[]` (`{title,links}`), `includePages` (bool\|name), `path` |
| `structuredData()` | (per-page `<head>`) | JSON-LD `<script type=application/ld+json>` | `schemas` (Schema\|Schema[]\|`(ctx)=>…`) injected into **every** page via `ctx.head` |

- `sitemap`/`rss`/`llms` enumerate `ctx.routes` (static pages); **dynamic** routes
  (`:param`/`*`) are skipped automatically — expand them via the `entries`/`items` fn.
- `structured-data` builders: `organization`, `website`, `article`, `breadcrumbs`,
  `person`, `localBusiness`, `offer`, `product`, `place`, `review`, … plus
  `jsonLd(schema|schema[])` and `entity(type, input)` for arbitrary schema.org types.

## Build pipeline note

The SEO modules serve **dynamic-ish endpoints** at runtime (a route registered on the
app), recomputed per request (or static when their inputs are static). They are not
written to disk by SSG — they are live routes. For a fully static deploy, fetch each
emitted path (`/robots.txt`, `/sitemap.xml`, …) and write the responses yourself.
