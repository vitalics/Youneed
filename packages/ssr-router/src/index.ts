// @youneed/ssr-router — Error/404 pages for the SSR stack + the client router.
//
//   import { router } from "@youneed/ssr-router";
//   app.plugin(ssr({ pages: [Home, Blog], modules: [router({ notFound: NotFound, error: ErrorPage })] }));
//
// SERVER: `router()` is an SSR module that installs ONE global middleware. It
// re-renders the framework's default 404 as your `notFound` page (status 404),
// and catches a thrown render as your `error` page (status 500). Both are plain
// `Page`s — not mounted as public routes; the module renders them directly.
//
// CLIENT: re-exports @youneed/dom-router (`createRouter`/`createMatcher`) for SPA
// navigation, plus `catchAll(component)` — a `{ path: "*" }` route for a
// client-side 404. One route table, both sides.

import { Response, type Context, type HttpResult } from "@youneed/server";
import { renderPageToString, type PageClass } from "@youneed/ssr";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

/** Options for {@link router}. */
export interface SsrRouterOptions {
  /** Page rendered for unmatched URLs (status 404). */
  notFound?: PageClass;
  /** Page rendered when a command/page render throws (status 500). */
  error?: PageClass;
}

/** Render a Page to an HTML response with a given status. */
async function renderPageResponse(PageCls: PageClass, ctx: Context, status: number): Promise<HttpResult> {
  const body = await renderPageToString(PageCls, ctx, []);
  return Response({ status, headers: { "content-type": "text/html; charset=utf-8" }, body });
}

/**
 * SSR router module. Adds Error/404 handling via one global middleware:
 * a default 404 becomes `notFound` (404); a thrown render becomes `error` (500).
 */
export function router(options: SsrRouterOptions = {}): SsrModule {
  const { notFound, error } = options;
  return {
    name: "router",
    setup(ctx: SsrModuleContext) {
      ctx.app.use(async (c: Context, next) => {
        try {
          const res = (await next()) as HttpResult | undefined;
          if (notFound && (res as { status?: number } | undefined)?.status === 404) {
            return await renderPageResponse(notFound, c, 404);
          }
          return res;
        } catch (err) {
          if (!error) throw err;
          // Expose the error to the page (read via the server ctx) for dev pages.
          (c as unknown as { error?: unknown }).error = err;
          return await renderPageResponse(error, c, 500);
        }
      });
    },
    inspect() {
      return { kind: "router", notFound: notFound?.name, error: error?.name };
    },
  };
}

// ── client SPA router (@youneed/dom-router) ───────────────────────────────────

export {
  createRouter,
  createMatcher,
  outlet,
  OUTLET_MARKER,
  OUTLET_SELECTOR,
  routerProvider,
} from "@youneed/dom-router";
export type {
  Router,
  RouteDef,
  RouteMatch,
  RouterMode,
  RouterApi,
  RouterOptions as DomRouterOptions,
} from "@youneed/dom-router";

import type { RouteDef } from "@youneed/dom-router";

/** A catch-all client route → mount `component` for unmatched paths (client 404). */
export function catchAll(component: RouteDef["component"]): RouteDef {
  return { path: "*", component };
}
