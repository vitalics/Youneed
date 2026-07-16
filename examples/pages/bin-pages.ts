// bin-pages.ts — SSR Pages demo wiring up the whole @youneed SSR stack.
// Run: pnpm examples:pages  ->  http://localhost:3011
//
// Everything is mounted through ONE plugin — `ssr()` from
// @youneed/server-plugin-ssr — which owns the page list and runs the satellite
// SSR modules against it:
//
//   • meta            — SEO <meta> + OpenGraph + Twitter cards (per page)
//   • canonical       — <link rel="canonical"> (auto, from origin + path)
//   • preload         — resource hints (<link rel="modulepreload"> …)
//   • speculation     — <script type="speculationrules"> (prefetch/prerender)
//   • structured-data — site-wide JSON-LD (Organization + WebSite)
//   • robots          — /robots.txt (+ Sitemap: link)
//   • sitemap         — /sitemap.xml (from the mounted page routes)
//   • rss             — /rss.xml feed
//   • llms            — /llms.txt (with a Pages section from the routes)
//   • csp             — nonce-based Content-Security-Policy on documents
//
// Navigate "/" → "/about": the browser prerenders /about on hover (speculation).
// View source on "/" to see the meta/canonical/preload/JSON-LD/CSP-nonce'd head.

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { Page } = await import("@youneed/ssr");
const { Application, File } = await import("@youneed/server");
const { ssr } = await import("@youneed/server-plugin-ssr");
const { meta } = await import("@youneed/ssr-plugin-meta");
const { canonical } = await import("@youneed/ssr-plugin-canonical");
const { preload } = await import("@youneed/ssr-plugin-preload");
const { speculation } = await import("@youneed/ssr-plugin-speculation");
const { structuredData, organization, website } = await import("@youneed/ssr-plugin-structured-data");
const { robots } = await import("@youneed/ssr-plugin-robots");
const { sitemap } = await import("@youneed/ssr-plugin-sitemap");
const { rss } = await import("@youneed/ssr-plugin-rss");
const { llms } = await import("@youneed/ssr-plugin-llms");
const { csp } = await import("@youneed/ssr-plugin-csp");
const { router, outlet } = await import("@youneed/ssr-router");

const ORIGIN = "http://localhost:3011";

// Shared layout shell with an outlet hole. The page body is spliced into the
// outlet on the server; the client router swaps only the outlet on navigation.
const SHELL = `<header><nav><a href="/">Home</a> · <a href="/about">About</a> · <a href="/blog">Blog</a></nav></header>${outlet()}<footer>© youneed</footer>`;

// ── components ────────────────────────────────────────────────────────────────
// Shared with the client bundle (components.ts) so the SSR'd elements hydrate —
// and appear in the devtools Components tree. Imported after registerDOM().
const { HomeApp, AboutApp, BlogApp, NotFoundApp, ErrorApp } = await import("./components.ts");

// ── pages ─────────────────────────────────────────────────────────────────────
// `About` is declared first so `Home` can reference `About.url` eagerly; `About`
// references `Home.url` through the `speculation()` method override (no cycle).

class About extends Page("/about", {
  title: "About",
  clientScript: () => import("./client.ts"),
  meta: { description: "What this demo is about." },
  layout: SHELL,
}) {
  override speculation() {
    return { prefetch: [{ source: "list" as const, urls: [Home.url], eagerness: "conservative" as const }] };
  }
  override render() {
    return AboutApp;
  }
}

class Blog extends Page("/blog", {
  title: "Blog",
  clientScript: () => import("./client.ts"),
  meta: { description: "Posts about the youneed SSR stack.", og: { type: "website" } },
  layout: SHELL,
}) {
  override render() {
    return BlogApp;
  }
}

class Home extends Page("/", {
  title: "Home",
  clientScript: () => import("./client.ts"),
  meta: {
    description: "The youneed SSR Pages demo home page.",
    og: { image: "/og.png" },
    twitter: { card: "summary_large_image" },
  },
  // Resource hint: warm up the client bundle the page links.
  preload: [{ rel: "modulepreload", href: "/client.js" }],
  // Prerender /about on moderate intent.
  speculation: { prerender: [{ source: "list", urls: [About.url], eagerness: "moderate" }] },
  layout: SHELL,
}) {
  override render() {
    return HomeApp;
  }
}

// Error/404 targets (rendered by the router module, not mounted as routes).
class NotFound extends Page("/404", { title: "Not Found" }) {
  override render() {
    return NotFoundApp;
  }
}
class ErrorPage extends Page("/500", { title: "Error" }) {
  override render() {
    return ErrorApp;
  }
}
// Demo page that throws → router renders the error page (500).
class Boom extends Page("/boom", { title: "Boom" }) {
  override render(): never {
    throw new Error("demo error");
  }
}

// ── app ───────────────────────────────────────────────────────────────────────

const app = Application()
  .plugin(
    ssr({
      origin: ORIGIN,
      devtools: true, // embed the page + routes payload for the client devtools
      pages: [Home, About, Blog, Boom],
      modules: [
        meta({ siteName: "youneed Pages demo", twitterSite: "@youneed" }),
        canonical(),
        preload({ hints: [{ rel: "preconnect", href: "https://fonts.gstatic.com" }] }),
        speculation(),
        structuredData({
          schemas: [
            organization({ name: "youneed", url: ORIGIN }),
            website({ name: "youneed Pages demo", url: ORIGIN, searchUrl: `${ORIGIN}/search?q=` }),
          ],
        }),
        robots({ sitemap: true }),
        sitemap({ defaults: { changefreq: "weekly", priority: 0.6 } }),
        rss({
          title: "youneed Pages demo",
          description: "Posts about the youneed SSR stack.",
          items: [
            { title: "Launching youneed SSR", link: "/blog", description: "The SSR plugin stack.", pubDate: "2026-06-01T00:00:00Z" },
            { title: "Streaming with renderToStream", link: "/blog", description: "Web-stream SSR.", pubDate: "2026-06-10T00:00:00Z" },
          ],
        }),
        llms({ title: "youneed Pages demo", summary: "An SSR demo wiring up every @youneed SSR module.", includePages: true }),
        csp(),
        router({ notFound: NotFound, error: ErrorPage }),
      ],
    }),
  )
  // Serve the client bundle that mounts the devtools panel (build.mjs emits it).
  .get("/client.js", File("examples/pages/client.js"));

app.listen(3011, (ctx) => {
  console.log(`Pages server on http://localhost:${ctx.port}`);
  for (const path of ["/", "/about", "/blog", "/robots.txt", "/sitemap.xml", "/rss.xml", "/llms.txt"]) {
    console.log(`  GET ${path}`);
  }
});
