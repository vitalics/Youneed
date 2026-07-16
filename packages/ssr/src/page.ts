// page.ts — SSR/SSG page entity, the document-level twin of `Controller`.
//
//   class Home extends Page("/", { title: "Home" }) {
//     render() { return HomeApp; }            // a dom.ts component, or an HTML string
//   }
//   mountPages(Application(), Home).listen(3010, …);
//
// A Page owns a *whole document* (the <html> shell), unlike a Controller route
// that returns a value. Its headline feature is first-class Speculation Rules:
// the page declares which URLs the browser should prefetch/prerender, and the
// framework injects the `<script type="speculationrules">` block into the head.
//
// Like dom-ssr.ts, this module renders dom.ts components, so a server DOM MUST be
// registered before it is imported (via @youneed/dom's encapsulated happy-dom):
//
//   import { registerDOM } from "@youneed/dom/register";
//   registerDOM();
//   const { Page, mountPages } = await import("./page.ts");

import {
  renderToString,
  sharedSheetsHead,
  Html,
  Head,
  Body,
  Title,
  Meta,
  Script,
} from "./dom-ssr.ts";
import { createRegistry, ctorOf } from "@youneed/core";
import { Response } from "@youneed/server";
import { getHydrationProps, flushPendingDefines } from "@youneed/dom";
import type { ComponentConstructor } from "@youneed/dom";
import type { AppBuilder, Context, HttpResult } from "@youneed/server";

// ============================================================
// RouteContext — the ISOMORPHIC context passed to render()
// ------------------------------------------------------------
// render() runs on the server (SSR) and could run on the client (SPA), so it
// only gets what exists in both: the matched route. The full server `Context`
// (request/response/body/cookies) is reserved for mutations (@Page.post etc.),
// which are always server-side.
// ============================================================

export interface RouteContext {
  /** Pathname, e.g. "/users/42". */
  path: string;
  /** Route params, e.g. { id: "42" }. */
  params: Record<string, string>;
  /** Query string params, e.g. { tab: "orders" }. */
  query: Record<string, string>;
  /** Navigate away: server → redirect; client → router.navigate. */
  navigate(to: string): void;
}

/** Build the isomorphic RouteContext from a server Context. */
function routeContext(ctx: Partial<Context>): RouteContext {
  return {
    path: (ctx.request?.url ?? "/").split("?")[0],
    params: (ctx.params ?? {}) as Record<string, string>,
    query: (ctx.query ?? {}) as Record<string, string>,
    navigate(to: string) {
      throw new Redirect(to);
    },
  };
}

/** Thrown by RouteContext.navigate() on the server — turned into a 303. */
class Redirect {
  constructor(readonly to: string) {}
}

// ============================================================
// Speculation Rules API
// https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API
// ------------------------------------------------------------
// A faithful (if minimal) shape of the JSON that goes inside
// `<script type="speculationrules">`. Two source kinds:
//   • "list"     — an explicit `urls` array.
//   • "document" — let the browser pick links matching a `where` predicate.
// `eagerness` tunes how aggressively the browser acts on a candidate.
// ============================================================

type Eagerness = "immediate" | "eager" | "moderate" | "conservative";

interface SpeculationRule {
  source?: "list" | "document";
  /** For `source: "list"` — the URLs to prefetch/prerender. */
  urls?: string[];
  /** For `source: "document"` — a predicate over candidate links. */
  where?: Record<string, unknown>;
  eagerness?: Eagerness;
  /** "same-origin" pages can be prerendered; cross-site only prefetched. */
  referrer_policy?: string;
  requires?: Array<"anonymous-client-ip-when-cross-origin">;
}

interface SpeculationRules {
  prefetch?: SpeculationRule[];
  prerender?: SpeculationRule[];
}

// ============================================================
// Page options + base
// ============================================================

/**
 * The page's client bundle. Either an explicit served URL string, or — for
 * editor autocomplete + a type-checked module reference — a `() => import(...)`
 * thunk. The thunk is NEVER executed on the server (that would pull the client
 * module into Node); its literal specifier is read and mapped to a URL by
 * `clientScriptUrl` (e.g. `() => import("./client.ts")` → `/client.js`).
 */
type ClientScript = string | (() => Promise<unknown>);

/**
 * How a page is produced on a GET of its URL:
 *   • "ssr"    — re-render the document on every request (default).
 *   • "ssg"    — render once on first hit, then replay the cached HTML (static).
 *   • "client" — emit only the shell (head + client script); the browser renders
 *                the body. `render()` is NOT called on the server.
 */
type RenderMode = "ssr" | "ssg" | "client";

interface PageOptions {
  title?: string;
  lang?: string;
  /** Render strategy for this page (default `"ssr"`). */
  mode?: RenderMode;
  /** Extra static `<head>` entries (built with Meta/Link/Script). */
  head?: string[];
  /** A single client bundle to hydrate the page. */
  clientScript?: ClientScript;
  scripts?: Array<{ src: string; type?: string; defer?: boolean }>;
  /**
   * Speculation rules — either a value, or a thunk evaluated at render time.
   * Use the thunk form to reference a page declared *later* in the file:
   *   speculation: () => ({ prerender: [{ source: "list", urls: [About.url] }] })
   * The value form reads `Other.url` eagerly, so `Other` must already exist.
   */
  speculation?: SpeculationRules | ((ctx: Context) => SpeculationRules | undefined);
  /**
   * Layout shell wrapping the page body. A string (or `(ctx) => string`)
   * containing an outlet hole (`<div data-router-outlet></div>` — from
   * `outlet()`); the page body is spliced into it. Shared chrome (header/nav/
   * footer) lives here; on the client the router swaps only the outlet.
   */
  layout?: string | ((ctx: Context) => string);
}

// What `render()` may return: a dom.ts component class, a ready INSTANCE
// (`UserView.of({ user })` — props already set), or an HTML string. Async is
// allowed so handlers can fetch data first.
type PageBody = ComponentConstructor | HTMLElement | string;

// ============================================================
// Page route registry (for @Page.get/post/... extra methods)
// ============================================================

type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface PageRoute {
  verb: HttpVerb;
  /** Sub-path; empty means the page's own URL. */
  path: string;
  handlerName: string;
}

const pageRoutes = createRegistry<PageRoute[]>(() => []);

function registerPageRoute(ctor: Function, route: PageRoute): void {
  const list = pageRoutes.for(ctor);
  // Dedupe — addInitializer runs per instance, so a method could register twice.
  if (!list.some((r) => r.handlerName === route.handlerName && r.path === route.path)) {
    list.push(route);
  }
}

function getPageRoutes(ctor: Function): PageRoute[] {
  return pageRoutes.read(ctor) ?? [];
}

type PageHandler = (ctx: Context) => HttpResult | Promise<HttpResult>;

function pageVerb(verb: HttpVerb) {
  // @Page.post() (same URL) or @Page.get("/users/:id/stats") (sub-path).
  return (path = "") =>
    (_target: PageHandler, ctx: ClassMethodDecoratorContext) => {
      ctx.addInitializer(function (this: unknown) {
        registerPageRoute(ctorOf(this), {
          verb,
          path,
          handlerName: ctx.name as string,
        });
      });
    };
}

class PageInternal {
  /**
   * The route this page is served at (GET), exposed for cross-page references:
   *   speculation: { prerender: [{ source: "list", urls: [About.url] }] }
   * Referencing the class instead of a literal keeps links correct across path
   * refactors — a renamed route updates everywhere, type-checked.
   */
  static url = "";
  static options: PageOptions = {};

  Response = Response;

  /**
   * Produce the document body (GET of the page's URL). Gets the ISOMORPHIC
   * RouteContext (path/params/query/navigate) — not the server Context — so the
   * same render() can run on the server and in an SPA. Return a component class,
   * a ready instance (`View.of({…})`), or an HTML string. Subclasses override.
   */
  render(_ctx: RouteContext): PageBody | Promise<PageBody> {
    throw new Error(
      `${this.constructor.name} must implement render() returning a component or HTML string`,
    );
  }

  /** Redirect helper for mutations (POST→GET / PRG). Defaults to 303 See Other. */
  redirect(location: string, status = 303): HttpResult {
    return Response({ status, headers: { location } });
  }

  /** JSON helper for sub-route handlers (`@Page.get('/…')`). */
  json(data: unknown, opts?: { status?: number }): HttpResult {
    return Response.json(data, opts);
  }

  /** Per-request speculation rules; resolves the static option (value or thunk). */
  speculation(ctx: Context): SpeculationRules | undefined {
    const spec = (this.constructor as typeof PageInternal).options.speculation;
    return typeof spec === "function" ? spec(ctx) : spec;
  }

  /** Per-request extra `<head>` entries (merged after the static ones). */
  head(_ctx: Context): string[] {
    return [];
  }
}

type PageClass = typeof PageInternal;

function Page(path = "", options: PageOptions = {}): PageClass {
  class ScopedPage extends PageInternal {
    static override url = normalizePath(path);
    static override options = options;
  }
  return ScopedPage;
}

// Method decorators for extra routes co-located on the page:
//   @Page.post()                       -> POST  /the-page-url
//   @Page.get("/users/:id/stats")      -> GET   /users/:id/stats  (sub-path)
//   @Page.delete()                     -> DELETE /the-page-url
// `render()` itself is the GET of the page's own URL (no decorator needed).
Page.get = pageVerb("GET");
Page.post = pageVerb("POST");
Page.put = pageVerb("PUT");
Page.patch = pageVerb("PATCH");
Page.delete = pageVerb("DELETE");

// ============================================================
// Devtools payload (read by page-devtools.ts on the client)
// ------------------------------------------------------------
// Page settings + the route table only exist on the server. To surface them in
// the client inspector we serialize a small JSON blob into the SSR'd HTML; the
// client devtools panel reads it from `<script ... data-page-devtools>`.
// ============================================================

interface PageInfo {
  url: string;
  title?: string;
  lang?: string;
  mode?: RenderMode;
  clientScript?: string;
  speculation?: SpeculationRules;
}

/** A directed edge in the page graph: a speculation target of some page. */
interface PageLink {
  url: string;
  kind: "prefetch" | "prerender";
  eagerness?: Eagerness;
}

interface RouteInfo {
  url: string;
  title?: string;
  /** Outgoing edges — list-source speculation targets of this page. */
  links?: PageLink[];
}

/** A satellite SSR feature surfaced in the client page-devtools "Plugins" tab.
 *  `info` is the module's `inspect()` (e.g. `{ kind: "robots", path: "/robots.txt" }`). */
interface PageModuleInfo {
  name: string;
  info?: unknown;
}

interface DevtoolsPayload {
  page: PageInfo;
  routes: RouteInfo[];
  /** Mounted SSR modules (robots/sitemap/rss/structured-data/…), if any. */
  modules?: PageModuleInfo[];
}

/** Stable attribute the client devtools queries for. */
const DEVTOOLS_MARKER = "data-page-devtools";

/** Layout outlet hole — kept in sync with @youneed/dom-router `outlet()`. */
const OUTLET_MARKER = "<div data-router-outlet></div>";

// Off by default — the payload exposes the route table, so opt in for dev only.
let devtoolsEnabled = false;
function enablePageDevtools(on = true): void {
  devtoolsEnabled = on;
}

// The SSR modules to advertise in the devtools payload. `server-plugin-ssr`'s
// `ssr({ devtools: true })` fills this from each module's `inspect()`; the core
// renderer doesn't know about the modules itself.
let devtoolsModules: PageModuleInfo[] = [];
function setPageDevtoolsModules(modules: PageModuleInfo[]): void {
  devtoolsModules = modules;
}

// ============================================================
// Global <head> providers
// ------------------------------------------------------------
// External SSR modules (e.g. @youneed/ssr-plugin-structured-data) need to add
// document-level `<head>` content — JSON-LD, canonical links, OpenGraph — to
// EVERY page without touching each Page subclass. A provider runs per request,
// after the page's own static + dynamic head, and returns extra entries.
// Append-only; `registerGlobalHead` returns a disposer for tests/teardown.
// ============================================================

type HeadProvider = (ctx: Context) => string[] | string | undefined;
const globalHeadProviders: HeadProvider[] = [];

/** Contribute `<head>` entries to every rendered page. Returns an unregister fn. */
function registerGlobalHead(provider: HeadProvider): () => void {
  globalHeadProviders.push(provider);
  return () => {
    const i = globalHeadProviders.indexOf(provider);
    if (i !== -1) globalHeadProviders.splice(i, 1);
  };
}

/** Resolve all global head providers for one request (a throwing one is skipped). */
function resolveGlobalHead(ctx: Context): string[] {
  const out: string[] = [];
  for (const provider of globalHeadProviders) {
    try {
      const entry = provider(ctx);
      if (Array.isArray(entry)) out.push(...entry);
      else if (entry) out.push(entry);
    } catch {
      /* a head provider must never break the document */
    }
  }
  return out;
}

// ============================================================
// Page middleware
// ------------------------------------------------------------
// Like a global head provider, but PAGE-AWARE: it runs per page render and
// receives the page instance + its options + the route table, not just the
// request. This is the seam features like Speculation Rules plug into — the page
// DECLARES its rules (the `speculation` option / `speculation()` method), and an
// opt-in middleware (`@youneed/ssr-plugin-speculation`) turns that declaration
// into the `<script type="speculationrules">` injected here. Append-only;
// `registerPageMiddleware` returns a disposer for tests/teardown.
// ============================================================

/** The minimal page surface a middleware can rely on (satisfied by every Page). */
export interface PageInstance {
  speculation(ctx: Context): SpeculationRules | undefined;
  head(ctx: Context): string[];
}

/** Everything a page middleware sees for one render. */
export interface PageRenderContext {
  /** The page instance being rendered. */
  page: PageInstance;
  /** The page's static options. */
  options: PageOptions;
  /** The page's served URL. */
  url: string;
  /** The live server request context. */
  ctx: Context;
  /** The full route table (for cross-page features). */
  routes: RouteInfo[];
}

/** Contributes `<head>` entries for a single page render. */
export type PageMiddleware = (c: PageRenderContext) => string[] | string | undefined;

const pageMiddleware: PageMiddleware[] = [];

/** Register page middleware. Returns an unregister fn. */
function registerPageMiddleware(mw: PageMiddleware): () => void {
  pageMiddleware.push(mw);
  return () => {
    const i = pageMiddleware.indexOf(mw);
    if (i !== -1) pageMiddleware.splice(i, 1);
  };
}

/** Run all page middleware for one render (a throwing one is skipped). */
function resolvePageHead(c: PageRenderContext): string[] {
  const out: string[] = [];
  for (const mw of pageMiddleware) {
    try {
      const entry = mw(c);
      if (Array.isArray(entry)) out.push(...entry);
      else if (entry) out.push(entry);
    } catch {
      /* a page middleware must never break the document */
    }
  }
  return out;
}

function devtoolsScript(payload: DevtoolsPayload): string {
  // Escape `<` so a URL/title containing "</script>" can't break out of the tag.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<script type="application/json" ${DEVTOOLS_MARKER}>${json}</script>`;
}

/**
 * Resolve a `clientScript` option to the URL that goes in `<script src>`.
 * A string is used as-is. A `() => import("…")` thunk is read via its source
 * (never called) — the literal specifier's basename, with a TS extension
 * swapped to `.js`, is served at the root: `./client.ts` → `/client.js`.
 * Returns undefined if the thunk has no statically-readable string specifier.
 */
function clientScriptUrl(cs: ClientScript | undefined): string | undefined {
  if (cs == null) return undefined;
  if (typeof cs === "string") return cs;
  const m = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(cs.toString());
  if (!m) return undefined;
  const file = m[1].split(/[\\/]/).pop() ?? m[1];
  return "/" + file.replace(/\.(m|c)?tsx?$/, ".js");
}

// ============================================================
// Rendering + mounting
// ============================================================

/** Assemble the full HTML document for one page instance + request. */
async function renderDocument(
  page: PageInternal,
  ctx: Context,
  routes: RouteInfo[] = [],
): Promise<string> {
  const opts = (page.constructor as PageClass).options;
  const url = (page.constructor as PageClass).url;

  // Register deferred/"server" components (@Component.define(when)) before
  // render() runs — it may construct them eagerly via `View.of(...)`, which
  // needs the custom element already defined.
  flushPendingDefines();

  const mode: RenderMode = opts.mode ?? "ssr";
  let bodyHtml = "";
  let hydrateScript = "";
  // Declaratively-adopted sheets (registerTailwind strategy "fouc") are emitted
  // once here, not copied into each shadow root — see dom-ssr.ts.
  const sharedSheets = new Map<string, string>();
  // "client": emit only the shell — the browser renders the body via the client
  // script, so render() never runs on the server. "ssr"/"ssg" render the body.
  if (mode !== "client") {
    // render() gets the isomorphic RouteContext; speculation()/head() keep the
    // full server Context (head meta can depend on cookies/etc).
    const body = await page.render(routeContext(ctx));
    if (typeof body === "string") {
      bodyHtml = body;
    } else if (typeof body === "function") {
      bodyHtml = renderToString(body, { sharedSheets }); // component class — no props to hydrate
    } else {
      // Ready instance (e.g. View.of({…})): serialize its props so the client can
      // hydrate the same component with the same data after the SSR'd markup.
      const props = getHydrationProps(body);
      if (props) {
        const json = JSON.stringify({ tag: body.tagName.toLowerCase(), props }).replace(/</g, "\\u003c");
        hydrateScript = `<script type="application/json" data-hydrate>${json}</script>`;
      }
      bodyHtml = renderToString(body, { sharedSheets });
    }

    // Layout: render the page INTO the layout's outlet hole. The shell (header/
    // nav/footer) is shared; on the client the router swaps only the outlet.
    if (opts.layout) {
      const shell = typeof opts.layout === "function" ? opts.layout(ctx) : opts.layout;
      bodyHtml = shell.includes(OUTLET_MARKER)
        ? shell.replace(OUTLET_MARKER, `<div data-router-outlet>${bodyHtml}</div>`)
        : shell + bodyHtml;
    }
  }

  const clientUrl = clientScriptUrl(opts.clientScript);
  const scripts = [
    ...(opts.scripts ?? []),
    ...(clientUrl ? [{ src: clientUrl, type: "module" }] : []),
  ];

  // Speculation Rules injection lives in @youneed/ssr-plugin-speculation now —
  // registered as page middleware. The devtools payload still introspects the
  // page's declared rules (the inspector graph reads them).
  const pageHead = resolvePageHead({ page, options: opts, url, ctx, routes });

  const devtools = devtoolsEnabled
    ? [
        devtoolsScript({
          page: { url, title: opts.title, lang: opts.lang, mode: opts.mode ?? "ssr", clientScript: clientUrl, speculation: page.speculation(ctx) },
          routes,
          ...(devtoolsModules.length ? { modules: devtoolsModules } : {}),
        }),
      ]
    : [];

  return Html(
    { lang: opts.lang ?? "en" },
    Head(
      Meta({ charset: "utf-8" }),
      Meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
      Title(opts.title ?? "App"),
      ...(opts.head ?? []),
      ...page.head(ctx),
      ...resolveGlobalHead(ctx),
      ...pageHead,
      ...(sharedSheets.size ? [sharedSheetsHead(sharedSheets)] : []),
      ...devtools,
    ),
    Body(bodyHtml, hydrateScript, ...scripts.map((s) => Script(s))),
  );
}

/** Resolve a page's list-source speculation targets into graph edges. */
function pageLinks(P: PageClass): PageLink[] {
  let rules: SpeculationRules | undefined;
  try {
    // Call the instance method so options (value/thunk) AND a `speculation()`
    // override all resolve the same way. Best-effort: no live ctx for the graph.
    rules = new P().speculation({} as Context);
  } catch {
    return [];
  }
  if (!rules) return [];
  const out: PageLink[] = [];
  for (const kind of ["prefetch", "prerender"] as const) {
    for (const rule of rules[kind] ?? []) {
      for (const url of rule.urls ?? []) out.push({ url, kind, eagerness: rule.eagerness });
    }
  }
  return out;
}

/** The route table (url + title + edges) for a set of pages — fed into the payload. */
function routeTable(pages: PageClass[]): RouteInfo[] {
  return pages.map((P) => ({ url: P.url, title: P.options.title, links: pageLinks(P) }));
}

/**
 * Build the GET handler for the page's URL, honoring its render `mode`:
 *   • "ssr"    — re-render the document on every request.
 *   • "ssg"    — render once on the first request, then replay the cached HTML.
 *   • "client" — emit the shell only (renderDocument skips render() for it).
 */
function pageHandler(
  PageCls: PageClass,
  routes: RouteInfo[] = [],
  mode: RenderMode = "ssr",
): (ctx: Context) => Promise<HttpResult> {
  const instance = new PageCls();
  const html = (body: string): HttpResult =>
    Response({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body });
  let cached: string | undefined; // SSG: the document rendered once, then replayed
  return async (ctx) => {
    try {
      if (mode === "ssg") return html((cached ??= await renderDocument(instance, ctx, routes)));
      return html(await renderDocument(instance, ctx, routes));
    } catch (err) {
      if (err instanceof Redirect) return Response({ status: 303, headers: { location: err.to } });
      throw err;
    }
  };
}

/** Wrap a mutation/sub-route handler method, turning navigate() into a 303. */
function methodHandler(
  instance: PageInternal,
  handlerName: string,
): (ctx: Context) => Promise<HttpResult> {
  const fn = (instance as unknown as Record<string, PageHandler>)[handlerName].bind(instance);
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof Redirect) return Response({ status: 303, headers: { location: err.to } });
      throw err;
    }
  };
}

/**
 * Mount pages on an app. Each page's `render()` becomes GET of its URL; any
 * `@Page.get/post/put/patch/delete`-decorated methods become extra routes
 * (sub-path, or the page's URL when no path is given). Returns the app.
 */
function mountPages(app: AppBuilder, ...pages: PageClass[]): AppBuilder {
  const routes = routeTable(pages);
  const verbs = { GET: "get", POST: "post", PUT: "put", PATCH: "patch", DELETE: "delete" } as const;
  for (const PageCls of pages) {
    const instance = new PageCls(); // triggers @Page.* initializers -> registers routes
    app.get(PageCls.url, pageHandler(PageCls, routes, PageCls.options.mode ?? "ssr")); // render() = GET of the URL
    for (const route of getPageRoutes(PageCls)) {
      const path = route.path || PageCls.url; // empty path = the page's own URL
      app[verbs[route.verb]](path, methodHandler(instance, route.handlerName));
    }
  }
  return app;
}

/**
 * Render a page to a static HTML string (SSG). `ctx` is faked since there is no
 * live request — pass overrides if `render()` reads from it. Pass `routes` to
 * include the full table in the devtools payload (SSG knows all pages up front).
 */
async function renderPageToString(
  PageCls: PageClass,
  ctx: Partial<Context> = {},
  routes: RouteInfo[] = [],
): Promise<string> {
  return renderDocument(new PageCls(), ctx as Context, routes);
}

// Local path normalizer (mirrors server.ts; kept here to avoid coupling).
function normalizePath(path: string): string {
  const cleaned = ("/" + path).replace(/\/+/g, "/").replace(/\/$/, "");
  return cleaned === "" ? "/" : cleaned;
}

export {
  Page,
  mountPages,
  renderPageToString,
  routeTable,
  clientScriptUrl,
  enablePageDevtools,
  setPageDevtoolsModules,
  registerGlobalHead,
  registerPageMiddleware,
  DEVTOOLS_MARKER,
};
export type {
  PageClass,
  PageOptions,
  RenderMode,
  PageBody,
  ClientScript,
  SpeculationRules,
  SpeculationRule,
  Eagerness,
  PageInfo,
  RouteInfo,
  PageLink,
  PageModuleInfo,
  DevtoolsPayload,
};
