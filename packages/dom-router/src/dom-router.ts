// dom-router.ts — a tiny client-side router for SPAs built on dom.ts.
//
// Unlike SSR/SSG (which produce HTML for a real page load), this just MOUNTS the
// matched component into an outlet and swaps it on navigation — no page reload.
//
//   import { createRouter } from "./dom-router.ts";
//   const router = createRouter({
//     outlet: document.getElementById("app")!,
//     mode: "hash",                       // "hash" | "history" | "query"
//     routes: [
//       { path: "/",            component: HomePage },      // a component CLASS…
//       { path: "/users/:id",   component: "user-page" },   // …or a tag string. :param
//       { path: "/files/*",     component: "files-page" },  // wildcard -> params["*"]
//       { path: "*",            component: "not-found" },   // catch-all
//     ],
//   });
//
// `component` takes a tag string OR a component class — a class is registered
// automatically by its static `tagName`, so no separate side-effect import.
//
// The matched component is mounted with `.params` and `.query` set as JS
// properties; declare them as `@Component.prop()` to react to navigation:
//
//   class UserPage extends Component("user-page") {
//     @Component.prop() params: Record<string, string> = {};
//     @Component.prop() query: Record<string, string> = {};
//     render() { return html`user ${this.params.id}`; }
//   }

export type RouterMode = "hash" | "history" | "query";

/** The outlet hole — a region the router swaps on navigation while the layout
 *  shell around it stays put. The SAME marker the SSR layer splices the page
 *  body into, so server and client share one outlet. */
export const OUTLET_MARKER = "<div data-router-outlet></div>";
/** Selector for the outlet element (pass to `createRouter({ outlet })`). */
export const OUTLET_SELECTOR = "[data-router-outlet]";
/** Place an outlet hole in a layout template/string. */
export function outlet(): string {
  return OUTLET_MARKER;
}

/** A custom-element class with a static tag name — structurally a `@youneed/dom`
 *  `Component(...)` (kept local so the router stays dependency-free). */
export type ComponentConstructor = (new () => HTMLElement) & { tagName: string };

export interface RouteDef {
  /** "/", "/users/:id", "/files/*", or "*" (catch-all). */
  path: string;
  /**
   * What to mount when this route matches — either:
   *   • a custom-element tag string (`"docs-page"`), or
   *   • a component class (`DocsPage`), auto-registered by its static `tagName`.
   * Passing the class keeps routes type-checked and refactor-safe (no stringly
   * tag), and you don't need a separate side-effect import to register it.
   */
  component: string | ComponentConstructor;
}

export interface RouteMatch {
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  /** The matched route, plus the resolved custom-element `tag` to mount — a tag
   *  string passed through, or a component class's static `tagName`. */
  route: RouteDef & { tag: string };
}

export interface RouterOptions {
  routes: RouteDef[];
  /** The outlet hole: an Element, or a selector (e.g. `OUTLET_SELECTOR`) whose
   *  content is replaced with the matched component — the layout shell around it
   *  stays put. Only this region updates on navigation (partial routing).
   *  Optional: omit it and let a component supply its own outlet later via the
   *  router provider's `this.router.outlet()` (see {@link Router.setOutlet}). */
  outlet?: Element | string;
  /** URL strategy (default "hash"). */
  mode?: RouterMode;
  /** Path prefix for "history" mode (e.g. "/app"); stripped/added transparently. */
  base?: string;
  /** Query key holding the path in "query" mode (default "page"). */
  queryKey?: string;
}

export interface Router {
  /** Navigate to a path (updates the URL and mounts the matched component). */
  navigate(path: string, opts?: { replace?: boolean }): void;
  /** The current match (after the latest navigation). */
  readonly current: RouteMatch | undefined;
  /** The active URL strategy. */
  readonly mode: RouterMode;
  /** The tag currently mounted in the outlet (from navigation or `replaceWith`). */
  readonly component: string | undefined;
  /** Re-run matching against the current URL (rarely needed). */
  refresh(): void;
  /** Point the router at an outlet element and mount the current match into it.
   *  No-op if it's already the outlet. Used by the provider's `this.router.outlet()`
   *  so a component can host the router without passing `outlet` up front. */
  setOutlet(el: Element): void;
  /** Mount `component` (tag string or class) into the outlet WITHOUT touching the
   *  URL — an in-place node-tree swap (the provider's `this.router.replace()`). */
  replaceWith(component: string | ComponentConstructor): void;
  /** Subscribe to route changes (fires after a mount when the path/tag changed).
   *  Returns an unsubscribe. The provider uses it to `requestUpdate()` the host. */
  subscribe(listener: () => void): () => void;
  /** Remove listeners and the mounted component. */
  destroy(): void;
}

interface CompiledRoute extends RouteDef {
  regex: RegExp;
  paramNames: string[];
  /** The resolved custom-element tag to mount (from a string or a class). */
  tag: string;
}

/** The custom-element tag for a route's component (string → itself, class →
 *  its static `tagName`). Pure — does not touch the registry. */
function tagOf(component: string | ComponentConstructor): string {
  const tag = typeof component === "string" ? component : component.tagName;
  if (!tag) throw new Error("router: a route's component class has no static tagName");
  return tag;
}

/** Register a component class as a custom element (idempotent; no-op for a tag
 *  string or outside the DOM). Lets you pass a class without a side-effect import. */
function ensureDefined(component: string | ComponentConstructor): void {
  if (typeof component === "string" || typeof customElements === "undefined") return;
  const tag = component.tagName;
  if (tag && !customElements.get(tag)) customElements.define(tag, component);
}

// "/users/:id" -> /^\/users\/([^/]+)$/ with paramNames ["id"]. "*" and trailing
// "/*" become a catch-all capturing the rest into params["*"].
function compile(path: string): CompiledRoute["regex"] & { paramNames: string[] } {
  const paramNames: string[] = [];
  if (path === "*") {
    paramNames.push("*");
    return Object.assign(/^.*$/, { paramNames });
  }
  let source = "^";
  for (const seg of path.split("/").filter(Boolean)) {
    if (seg === "*") {
      paramNames.push("*");
      source += "/(.*)";
    } else if (seg.startsWith(":")) {
      paramNames.push(seg.slice(1));
      source += "/([^/]+)";
    } else {
      source += "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  source += "/?$";
  return Object.assign(new RegExp(source), { paramNames });
}

function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of sp) out[k] = v;
  return out;
}

/**
 * Build a standalone route matcher (no DOM, no outlet) — the pure hot path of
 * the router. Useful on the server (SSR page resolution) and easy to test/bench.
 *
 *   const match = createMatcher([{ path: "/users/:id", component: "u" }]);
 *   match("/users/42")?.params; // { id: "42" }
 */
export function createMatcher(routes: RouteDef[]): (path: string) => RouteMatch | undefined {
  const compiled: CompiledRoute[] = routes.map((r) => {
    const rx = compile(r.path);
    return { ...r, regex: rx, paramNames: rx.paramNames, tag: tagOf(r.component) };
  });
  return (path: string): RouteMatch | undefined => {
    const qi = path.indexOf("?");
    const pathname = qi === -1 ? path : path.slice(0, qi);
    const query = qi === -1 ? {} : parseQuery(path.slice(qi));
    for (const route of compiled) {
      const m = route.regex.exec(pathname);
      if (m) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1] ?? "")));
        return { path: pathname, params, query, route };
      }
    }
    return undefined;
  };
}

export function createRouter(options: RouterOptions): Router {
  const mode: RouterMode = options.mode ?? "hash";
  const base = options.base ?? "";
  const queryKey = options.queryKey ?? "page";
  const compiled: CompiledRoute[] = options.routes.map((r) => {
    ensureDefined(r.component); // register a passed component class (no-op for a tag string)
    const rx = compile(r.path);
    return { ...r, regex: rx, paramNames: rx.paramNames, tag: tagOf(r.component) };
  });

  // Resolve the outlet hole once (selector → element). Optional: a component may
  // attach one later via setOutlet(). Only a passed-but-unresolved selector throws.
  let outletEl: Element | null =
    typeof options.outlet === "string"
      ? (document.querySelector(options.outlet) as Element | null)
      : (options.outlet ?? null);
  if (options.outlet != null && !outletEl)
    throw new Error(`router: outlet not found (${String(options.outlet)})`);

  let current: RouteMatch | undefined;
  let mounted: { tag: string; el: HTMLElement } | undefined;
  const subscribers = new Set<() => void>();
  let lastKey = "";

  // Fire subscribers only when the mounted route actually changed — keeps a
  // subscriber's requestUpdate() → re-render → setOutlet() path from looping.
  function notify(): void {
    const key = `${current?.path ?? ""}|${mounted?.tag ?? ""}`;
    if (key === lastKey) return;
    lastKey = key;
    for (const fn of [...subscribers]) fn();
  }

  // Mount `tag` into the outlet (reuse the element when the tag is unchanged).
  function mountInto(tag: string, params: unknown, query: unknown): void {
    if (!outletEl) return; // no outlet yet — a component will attach one
    if (!mounted || mounted.tag !== tag) {
      mounted?.el.remove(); // disconnectedCallback -> onUnmount/dispose
      const el = document.createElement(tag) as HTMLElement & { params?: unknown; query?: unknown };
      el.params = params;
      el.query = query;
      outletEl.replaceChildren(el);
      mounted = { tag, el };
    } else {
      const el = mounted.el as HTMLElement & { params?: unknown; query?: unknown };
      el.params = params; // reactive prop -> re-render on param/query change
      el.query = query;
    }
  }

  // ---- read the current "path" + raw query from the URL, per mode ----
  function readLocation(): { path: string; query: Record<string, string> } {
    if (mode === "hash") {
      const raw = location.hash.slice(1) || "/"; // after '#'
      const q = raw.indexOf("?");
      return q === -1
        ? { path: raw, query: {} }
        : { path: raw.slice(0, q), query: parseQuery(raw.slice(q)) };
    }
    if (mode === "query") {
      const sp = new URLSearchParams(location.search);
      const path = sp.get(queryKey) || "/";
      sp.delete(queryKey);
      const query: Record<string, string> = {};
      for (const [k, v] of sp) query[k] = v;
      return { path, query };
    }
    // history
    let path = location.pathname;
    if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
    return { path, query: parseQuery(location.search) };
  }

  // ---- write a new location, per mode ----
  function writeLocation(path: string, replace: boolean): void {
    if (mode === "hash") {
      const url = "#" + path;
      if (replace) location.replace(url);
      else location.hash = path;
      return;
    }
    if (mode === "query") {
      const sp = new URLSearchParams(location.search);
      sp.set(queryKey, path);
      const url = `${location.pathname}?${sp}`;
      history[replace ? "replaceState" : "pushState"]({}, "", url);
      render();
      return;
    }
    history[replace ? "replaceState" : "pushState"]({}, "", base + path);
    render();
  }

  function match(path: string): { route: CompiledRoute; params: Record<string, string> } | undefined {
    for (const route of compiled) {
      const m = route.regex.exec(path);
      if (m) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1] ?? "")));
        return { route, params };
      }
    }
    return undefined;
  }

  function render(): void {
    const { path, query } = readLocation();
    const found = match(path);
    if (!found) {
      // No route (and no catch-all): clear the outlet.
      if (mounted) {
        mounted.el.remove();
        mounted = undefined;
      }
      current = undefined;
      notify();
      return;
    }
    const { route, params } = found;
    current = { path, params, query, route };
    mountInto(route.tag, params, query);
    notify();
  }

  const go = (path: string, replace = false) => writeLocation(path, replace);

  const onPopState = () => render();
  const onHashChange = () => render();

  // history/query are real URL changes, so a plain <a> would full-reload. Intercept
  // internal link clicks and route them in-app instead. hash mode doesn't need
  // this — the browser's hashchange already routes without a reload. Links use
  // logical paths ("/users/1"); navigate() re-encodes them for the active mode.
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Match HTML <a> (tagName "A") and SVG <a> (tagName "a") alike; `composedPath`
    // crosses shadow boundaries, so links inside shadow roots route too. Read the
    // target via attributes — an SVG anchor's `.href`/`.target` are SVGAnimatedString.
    const a = e.composedPath().find((n): n is Element => (n as Element)?.tagName?.toUpperCase?.() === "A");
    if (!a || a.getAttribute("target") || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("//") || /^[a-z]+:/i.test(href)) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    let path = url.pathname;
    if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
    go(path + url.search, false);
  };

  if (mode === "hash") {
    window.addEventListener("hashchange", onHashChange);
  } else {
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick);
  }

  render(); // initial

  return {
    navigate(path, opts) {
      go(path, opts?.replace ?? false);
    },
    get current() {
      return current;
    },
    get mode() {
      return mode;
    },
    get component() {
      return mounted?.tag;
    },
    refresh: render,
    setOutlet(el) {
      if (el === outletEl) return;
      outletEl = el;
      // Mount the current match into the freshly-attached outlet. No notify():
      // this runs during a host render, and notifying would re-enter render.
      if (current) mountInto(current.route.tag, current.params, current.query);
    },
    replaceWith(component) {
      ensureDefined(component);
      mountInto(tagOf(component), current?.params ?? {}, current?.query ?? {});
      notify();
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => void subscribers.delete(listener);
    },
    destroy() {
      if (mode === "hash") {
        window.removeEventListener("hashchange", onHashChange);
      } else {
        window.removeEventListener("popstate", onPopState);
        document.removeEventListener("click", onClick);
      }
      mounted?.el.remove();
      mounted = undefined;
    },
  };
}
