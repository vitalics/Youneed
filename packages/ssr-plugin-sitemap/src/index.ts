// @youneed/ssr-plugin-sitemap — a sitemap.xml SSR module.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { sitemap } from "@youneed/ssr-plugin-sitemap";
//
//   app.plugin(ssr({
//     origin: "https://example.com",
//     pages: [Home, About, Pricing],
//     modules: [
//       sitemap({
//         exclude: ["/admin", /^\/internal/],
//         entries: [{ url: "/blog/launch", lastmod: "2026-06-01", priority: 0.8 }],
//         defaults: { changefreq: "weekly", priority: 0.5 },
//       }),
//     ],
//   }));
//
// Static page routes are enumerated automatically; dynamic routes (`/users/:id`)
// are skipped (no single canonical URL) — list those via `entries`. The feed is
// built per request, so a function `entries` can return fresh data.

import { Response } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

/** One `<url>` entry. */
export interface SitemapEntry {
  /** Path (resolved against `origin`) or an absolute URL. */
  url: string;
  /** `<lastmod>` — a Date (→ W3C date) or a pre-formatted string. */
  lastmod?: string | Date;
  changefreq?: ChangeFreq;
  /** `<priority>` 0.0–1.0. */
  priority?: number;
}

export interface SitemapOptions {
  /** Served path. Default `"/sitemap.xml"`. */
  path?: string;
  /** Drop matching page routes (string = exact URL, RegExp = test the URL). */
  exclude?: Array<string | RegExp>;
  /** Extra entries (e.g. expansions of dynamic routes), value or async fn. */
  entries?: SitemapEntry[] | ((ctx: SsrModuleContext) => SitemapEntry[] | Promise<SitemapEntry[]>);
  /** Include the mounted static page routes. Default `true`. */
  includePages?: boolean;
  /** Defaults applied to page-derived entries. */
  defaults?: { changefreq?: ChangeFreq; priority?: number };
}

const xmlEscape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&apos;",
  );

const w3cDate = (d: string | Date): string =>
  typeof d === "string" ? d : d.toISOString();

function excluded(url: string, rules: Array<string | RegExp> = []): boolean {
  return rules.some((r) => (typeof r === "string" ? r === url : r.test(url)));
}

/** Render a `<urlset>` document for a resolved entry list. */
export function buildSitemap(entries: SitemapEntry[], ctx: SsrModuleContext): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(ctx.absolute(e.url))}</loc>`];
      if (e.lastmod != null) parts.push(`    <lastmod>${xmlEscape(w3cDate(e.lastmod))}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

/** Collect the final entry list: page routes (unless excluded) + explicit entries. */
async function collect(options: SitemapOptions, ctx: SsrModuleContext): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = [];
  if (options.includePages !== false) {
    for (const route of ctx.routes) {
      if (route.dynamic) continue; // no single canonical URL — use `entries`
      if (excluded(route.url, options.exclude)) continue;
      out.push({ url: route.url, ...options.defaults });
    }
  }
  const extra =
    typeof options.entries === "function" ? await options.entries(ctx) : options.entries ?? [];
  out.push(...extra);
  return out;
}

/** A sitemap.xml {@link SsrModule}. */
export function sitemap(options: SitemapOptions = {}): SsrModule {
  const path = options.path ?? "/sitemap.xml";
  return {
    name: "sitemap",
    setup(ctx) {
      ctx.app.get(path, async () => {
        const body = buildSitemap(await collect(options, ctx), ctx);
        return Response({
          status: 200,
          headers: { "Content-Type": "application/xml; charset=utf-8" },
          body,
        });
      });
    },
    inspect() {
      return { kind: "sitemap", path, includePages: options.includePages !== false };
    },
  };
}
