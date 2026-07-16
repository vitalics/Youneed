// @youneed/server-plugin-ssr — add SSR to a @youneed/server app from the OUTSIDE.
//
// Where @youneed/ssr's `mountPages(app, ...pages)` wraps the *server* into an SSR
// host, this inverts the dependency: SSR becomes a plugin the *server* opts into,
// exactly like jobs/cluster/devtools:
//
//   import { Application } from "@youneed/server";
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { robots } from "@youneed/ssr-plugin-robots";
//   import { sitemap } from "@youneed/ssr-plugin-sitemap";
//
//   Application()
//     .plugin(ssr({
//       origin: "https://example.com",
//       pages: [Home, About, BlogPost],
//       modules: [robots({ sitemap: true }), sitemap()],
//     }))
//     .listen(3000, () => {});
//
// The plugin owns the page list. Satellite SSR modules (robots, sitemap, rss,
// llms, structured-data) are *not* server plugins themselves — they implement the
// {@link SsrModule} contract and receive an {@link SsrModuleContext} that exposes
// the discovered page routes, the configured `origin`, an absolute-URL resolver,
// and a per-page `<head>` registration. That keeps route knowledge in ONE place.

import {
  mountPages,
  routeTable,
  enablePageDevtools,
  setPageDevtoolsModules,
  registerGlobalHead,
} from "@youneed/ssr";
import type { PageClass } from "@youneed/ssr";
import type { AppBuilder, Context, ServerPlugin } from "@youneed/server";

// ============================================================
// The SSR module contract (implemented by @youneed/ssr-plugin-*)
// ============================================================

/** A page route discovered from the mounted pages. */
export interface SsrRoute {
  /** The page URL pattern, e.g. "/" or "/users/:id". */
  url: string;
  /** The page's `title` option, if any. */
  title?: string;
  /** Whether the URL has a dynamic segment (`:param` or `*`) — sitemaps/feeds
   *  skip these because they have no single canonical URL. */
  dynamic: boolean;
}

/** Everything an {@link SsrModule} gets to wire itself into the app. */
export interface SsrModuleContext {
  /** The server app — register routes (`app.get("/robots.txt", …)`) here. */
  app: AppBuilder;
  /** Absolute site origin for canonical links, e.g. "https://example.com". */
  origin?: string;
  /** Static (non-dynamic) page routes — sitemap/rss/llms enumerate these. */
  routes: SsrRoute[];
  /** Resolve a path to an absolute URL against `origin` (pass-through if a path
   *  is already absolute or no origin is set). */
  absolute(path: string): string;
  /** Contribute entries to EVERY rendered page's `<head>` (e.g. JSON-LD). */
  head(provider: (ctx: Context) => string[] | string | undefined): void;
}

/**
 * A satellite SSR feature mounted through {@link ssr}'s `modules` option.
 * Implemented by `@youneed/ssr-plugin-robots`, `-sitemap`, `-rss`, `-llms` and
 * `-structured-data`.
 */
export interface SsrModule {
  name: string;
  /** Called once, during the host plugin's `setup`, after pages are mounted. */
  setup(ctx: SsrModuleContext): void;
  /** Optional JSON-safe description for the devtools Infra view. */
  inspect?(): unknown;
}

// ============================================================
// The host plugin
// ============================================================

export interface SsrPluginOptions {
  /** Pages to mount (`render()` → GET of the page URL, plus `@Page.*` routes). */
  pages?: PageClass[];
  /** Absolute site origin, handed to modules for canonical links. */
  origin?: string;
  /** Turn on the client page-devtools payload (route table is exposed — dev only). */
  devtools?: boolean;
  /** SSR satellite modules (robots, sitemap, rss, llms, structured-data). */
  modules?: SsrModule[];
}

/** Build the absolute-URL resolver bound to an origin. */
function makeAbsolute(origin: string | undefined): (path: string) => string {
  return (path: string) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path; // already absolute
    if (!origin) return path;
    return origin.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  };
}

/**
 * A {@link ServerPlugin} that mounts SSR pages and their satellite modules.
 * The owned page list is the single source of truth for the route table that
 * sitemaps, feeds and llms.txt enumerate.
 */
export function ssr(options: SsrPluginOptions = {}): ServerPlugin {
  const { pages = [], origin, devtools = false, modules = [] } = options;
  return {
    name: "ssr",
    setup(app) {
      if (devtools) enablePageDevtools(true);
      if (pages.length) mountPages(app, ...pages);

      const routes: SsrRoute[] = routeTable(pages).map((r) => ({
        url: r.url,
        title: r.title,
        dynamic: /[:*]/.test(r.url),
      }));

      const ctx: SsrModuleContext = {
        app,
        origin,
        routes,
        absolute: makeAbsolute(origin),
        head: (provider) => void registerGlobalHead(provider),
      };

      for (const module of modules) module.setup(ctx);

      // Surface the modules in the client page-devtools "Plugins" tab.
      if (devtools) {
        setPageDevtoolsModules(modules.map((m) => ({ name: m.name, info: m.inspect?.() })));
      }
    },
    inspect() {
      return {
        kind: "ssr",
        origin,
        pages: pages.length,
        modules: modules.map((m) => ({ name: m.name, info: m.inspect?.() })),
      };
    },
  };
}
