// @youneed/ssr-plugin-rss — an RSS 2.0 / Atom feed SSR module.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { rss } from "@youneed/ssr-plugin-rss";
//
//   app.plugin(ssr({
//     origin: "https://example.com",
//     modules: [
//       rss({
//         title: "Example Blog",
//         description: "Latest posts",
//         items: () => loadPosts().then((p) => p.map((post) => ({
//           title: post.title,
//           link: `/blog/${post.slug}`,
//           description: post.excerpt,
//           pubDate: post.publishedAt,
//           guid: post.id,
//         }))),
//       }),
//     ],
//   }));
//
// `items` may be a value or an (async) function so the feed reflects fresh data
// on each request. Links are resolved to absolute URLs against `origin`.

import { Response } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

/** One feed item. */
export interface RssItem {
  title: string;
  /** Path (resolved against `origin`) or an absolute URL. */
  link: string;
  description?: string;
  /** Stable id. Defaults to the resolved `link`. */
  guid?: string;
  /** Publish date — a Date or a pre-formatted string. */
  pubDate?: string | Date;
  author?: string;
  categories?: string[];
}

export type FeedFormat = "rss" | "atom";

export interface RssOptions {
  /** Served path. Default `"/rss.xml"` (or `"/atom.xml"` when `format: "atom"`). */
  path?: string;
  format?: FeedFormat;
  title: string;
  description: string;
  /** Site link. Defaults to `origin`. */
  link?: string;
  language?: string;
  /** Feed items — value or (async) function. */
  items: RssItem[] | ((ctx: SsrModuleContext) => RssItem[] | Promise<RssItem[]>);
}

const xmlEscape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&apos;",
  );

const rfc822 = (d: string | Date): string =>
  typeof d === "string" ? d : d.toUTCString();
const iso = (d: string | Date): string =>
  typeof d === "string" ? d : d.toISOString();

const tag = (name: string, value: string): string => `<${name}>${xmlEscape(value)}</${name}>`;

function buildRss(items: RssItem[], options: RssOptions, ctx: SsrModuleContext): string {
  const siteLink = options.link ?? ctx.origin ?? "";
  const body = items
    .map((it) => {
      const link = ctx.absolute(it.link);
      const parts = [tag("title", it.title), tag("link", link), tag("guid", it.guid ?? link)];
      if (it.description) parts.push(tag("description", it.description));
      if (it.pubDate != null) parts.push(tag("pubDate", rfc822(it.pubDate)));
      if (it.author) parts.push(tag("author", it.author));
      for (const c of it.categories ?? []) parts.push(tag("category", c));
      return `    <item>\n      ${parts.join("\n      ")}\n    </item>`;
    })
    .join("\n");
  const channel = [
    tag("title", options.title),
    tag("description", options.description),
    siteLink ? tag("link", siteLink) : "",
    options.language ? tag("language", options.language) : "",
  ]
    .filter(Boolean)
    .join("\n    ");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n  <channel>\n    ${channel}\n${body}\n  </channel>\n</rss>\n`
  );
}

function buildAtom(items: RssItem[], options: RssOptions, ctx: SsrModuleContext): string {
  const siteLink = options.link ?? ctx.origin ?? "";
  const updated = items[0]?.pubDate != null ? iso(items[0].pubDate) : "";
  const entries = items
    .map((it) => {
      const link = ctx.absolute(it.link);
      const parts = [
        tag("title", it.title),
        `<link href="${xmlEscape(link)}"/>`,
        tag("id", it.guid ?? link),
      ];
      if (it.pubDate != null) parts.push(tag("updated", iso(it.pubDate)));
      if (it.description) parts.push(`<summary>${xmlEscape(it.description)}</summary>`);
      if (it.author) parts.push(`<author>${tag("name", it.author)}</author>`);
      for (const c of it.categories ?? []) parts.push(`<category term="${xmlEscape(c)}"/>`);
      return `  <entry>\n    ${parts.join("\n    ")}\n  </entry>`;
    })
    .join("\n");
  const header = [
    tag("title", options.title),
    tag("subtitle", options.description),
    siteLink ? `<link href="${xmlEscape(siteLink)}"/>` : "",
    siteLink ? tag("id", siteLink) : "",
    updated ? tag("updated", updated) : "",
  ]
    .filter(Boolean)
    .join("\n  ");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom">\n  ${header}\n${entries}\n</feed>\n`
  );
}

/** Render the feed body for a resolved item list (used by tests too). */
export function buildFeed(items: RssItem[], options: RssOptions, ctx: SsrModuleContext): string {
  return options.format === "atom"
    ? buildAtom(items, options, ctx)
    : buildRss(items, options, ctx);
}

/** An RSS/Atom feed {@link SsrModule}. */
export function rss(options: RssOptions): SsrModule {
  const path = options.path ?? (options.format === "atom" ? "/atom.xml" : "/rss.xml");
  return {
    name: "rss",
    setup(ctx) {
      ctx.app.get(path, async () => {
        const items =
          typeof options.items === "function" ? await options.items(ctx) : options.items;
        return Response({
          status: 200,
          headers: { "Content-Type": "application/xml; charset=utf-8" },
          body: buildFeed(items, options, ctx),
        });
      });
    },
    inspect() {
      return { kind: "rss", path, format: options.format ?? "rss" };
    },
  };
}
