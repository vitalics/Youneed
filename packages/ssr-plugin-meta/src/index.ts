// @youneed/ssr-plugin-meta — SEO <meta> + OpenGraph + Twitter Card tags.
//
// A page DECLARES its metadata through the `meta` option (added to PageOptions by
// this package); the middleware turns it into <meta> tags in the document head.
// OpenGraph `og:url`/`og:image` are resolved to absolute URLs against the SSR
// `origin`, so set `ssr({ origin })`.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { meta } from "@youneed/ssr-plugin-meta";
//
//   class Post extends Page("/blog/:slug", {
//     title: "Hello world",
//     meta: {
//       description: "An introductory post.",
//       og: { type: "article", image: "/og/hello.png" },
//       twitter: { card: "summary_large_image" },
//     },
//   }) { … }
//
//   app.plugin(ssr({ origin: "https://example.com", pages: [Post], modules: [meta({ siteName: "Example" })] }));

import { registerPageMiddleware, Meta } from "@youneed/ssr";
import type { Context } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

export interface OpenGraph {
  title?: string;
  description?: string;
  /** og:type — "website" (default), "article", "profile", … */
  type?: string;
  /** Resolved to absolute against `origin`. */
  image?: string;
  /** Defaults to the canonical/request URL (absolute). */
  url?: string;
  siteName?: string;
  locale?: string;
  [key: string]: string | undefined;
}

export interface TwitterCard {
  /** "summary" | "summary_large_image" | "app" | "player". Auto-picks from image. */
  card?: string;
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  /** Resolved to absolute against `origin`. */
  image?: string;
  [key: string]: string | undefined;
}

export interface MetaInput {
  /** Overrides the page title for og:/twitter: (page `title` is used otherwise). */
  title?: string;
  description?: string;
  keywords?: string | string[];
  /** robots directive, e.g. "index,follow" or "noindex,nofollow". */
  robots?: string;
  author?: string;
  themeColor?: string;
  og?: OpenGraph;
  twitter?: TwitterCard;
}

export interface MetaOptions {
  /** Defaults merged UNDER each page's own meta. */
  defaults?: MetaInput;
  /** Convenience: og:site_name / default. */
  siteName?: string;
  /** Convenience: twitter:site (@handle). */
  twitterSite?: string;
}

// Augment PageOptions so `meta` is typed on `Page("/", { meta: … })`.
declare module "@youneed/ssr" {
  interface PageOptions {
    meta?: MetaInput | ((ctx: Context) => MetaInput | undefined);
  }
}

function merge(base: MetaInput | undefined, over: MetaInput | undefined): MetaInput {
  return {
    ...base,
    ...over,
    og: { ...base?.og, ...over?.og },
    twitter: { ...base?.twitter, ...over?.twitter },
  };
}

/** Build the <meta> tags for one page render. `path` is the page's URL/request
 *  path, resolved to absolute for og:url. Exported for tests. */
export function buildMeta(input: MetaInput, title: string | undefined, ctx: SsrModuleContext, path: string): string[] {
  const out: string[] = [];
  const push = (map: Record<string, string | undefined>) => {
    if (map.content != null) out.push(Meta(map));
  };

  if (input.description) push({ name: "description", content: input.description });
  if (input.keywords)
    push({ name: "keywords", content: Array.isArray(input.keywords) ? input.keywords.join(", ") : input.keywords });
  if (input.robots) push({ name: "robots", content: input.robots });
  if (input.author) push({ name: "author", content: input.author });
  if (input.themeColor) push({ name: "theme-color", content: input.themeColor });

  // OpenGraph
  const og = input.og ?? {};
  const ogTitle = og.title ?? input.title ?? title;
  const ogUrl = og.url ? ctx.absolute(og.url) : ctx.absolute(path);
  push({ property: "og:title", content: ogTitle });
  push({ property: "og:description", content: og.description ?? input.description });
  push({ property: "og:type", content: og.type ?? "website" });
  push({ property: "og:url", content: ogUrl });
  push({ property: "og:site_name", content: og.siteName });
  push({ property: "og:locale", content: og.locale });
  if (og.image) push({ property: "og:image", content: ctx.absolute(og.image) });
  for (const [k, v] of Object.entries(og)) {
    if (["title", "description", "type", "url", "siteName", "locale", "image"].includes(k)) continue;
    push({ property: `og:${k}`, content: v });
  }

  // Twitter
  const tw = input.twitter ?? {};
  const card = tw.card ?? (og.image || tw.image ? "summary_large_image" : "summary");
  push({ name: "twitter:card", content: card });
  push({ name: "twitter:site", content: tw.site });
  push({ name: "twitter:creator", content: tw.creator });
  push({ name: "twitter:title", content: tw.title ?? ogTitle });
  push({ name: "twitter:description", content: tw.description ?? og.description ?? input.description });
  const twImage = tw.image ?? og.image;
  if (twImage) push({ name: "twitter:image", content: ctx.absolute(twImage) });

  return out;
}

/** An {@link SsrModule} that emits SEO/OpenGraph/Twitter meta per page. */
export function meta(options: MetaOptions = {}): SsrModule {
  // Fold the convenience options into the defaults.
  const defaults: MetaInput = merge(options.defaults, {
    og: options.siteName ? { siteName: options.siteName } : undefined,
    twitter: options.twitterSite ? { site: options.twitterSite } : undefined,
  });
  return {
    name: "meta",
    setup(ctx: SsrModuleContext) {
      registerPageMiddleware((c) => {
        const declared = c.options.meta;
        const resolved = typeof declared === "function" ? declared(c.ctx) : declared;
        const input = merge(defaults, resolved);
        // Prefer the live request path; fall back to the page's URL pattern (SSG).
        const path = c.ctx.request?.url ? c.ctx.request.url.split("?")[0] : c.url;
        return buildMeta(input, resolved?.title ?? c.options.title, ctx, path);
      });
    },
    inspect() {
      return { kind: "meta" };
    },
  };
}
