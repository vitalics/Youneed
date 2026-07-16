# youneed — SSR (Server-Side Rendering)

Render `@youneed/dom` components to HTML on the server, then hydrate on the
client. Source: `packages/ssr/src/{dom-ssr,page}.ts`,
`packages/server-plugin-ssr/src/index.ts`, `packages/ssr-router/src/index.ts`,
`packages/dom-router/src/dom-router.ts`, `examples/{ssr,pages}`.

## 1. Register a Node DOM — always first

```ts
import { registerDOM } from "@youneed/dom/register";
registerDOM();                       // happy-dom onto globalThis; idempotent
const { renderToString } = await import("@youneed/ssr");   // import AFTER registerDOM
```

Components `extends HTMLElement` at import time, so the DOM must exist first.
Use the `@youneed/dom/register` subpath — it encapsulates happy-dom so browser
bundles never pull it in. Also: `unregisterDOM()`, `isDOMRegistered()`.

## 2. Render a component to HTML

```ts
import { renderToString, renderToStream } from "@youneed/ssr";

renderToString(MyComponent);          // class → "<my-el><template shadowrootmode=open>…</template></my-el>"
renderToString(View.of({ user }));    // a ready INSTANCE — its props are kept for hydration
```

- Shadow DOM is emitted as **Declarative Shadow DOM** with `adoptedStyleSheets`
  inlined as `<style>` — hydrates natively. Deferred `@Component.define(when)` are
  flushed first; the render runs on `syncScheduler` (inline, no microtask wait).
- `renderToStream(root, writable, { close?, signal?, sharedSheets? })` writes chunks
  into a web `WritableStream<Uint8Array>` honoring backpressure — better TTFB, no
  whole-document buffering. The render itself is synchronous (happy-dom can't suspend);
  it streams the *serialization* of an already-built tree.

## 3. Document shell (compose by hand) or renderPage

```ts
import { Html, Head, Body, Title, Meta, Script, renderPage } from "@youneed/ssr";

Html({ lang: "en" }, Head(Meta({ charset: "utf-8" }), Title("Demo")),
  Body(renderToString(App), Script({ src: "/client.js", type: "module" })));

renderPage(App, { title: "Home", clientScript: "/client.js", head: [...], scripts: [...] });
```

`renderPage` is the convenience full-`<!doctype html>` build over those primitives.

## 4. Pages — the document-level twin of a Controller

```ts
import { Page, mountPages } from "@youneed/ssr";
import { Application } from "@youneed/server";

class Home extends Page("/", {
  title: "Home",
  clientScript: () => import("./client.ts"),   // thunk read statically → "/client.js" URL (never run on server)
  // mode: "ssr" (default) | "ssg" | "client"
  // layout: SHELL,  scripts: [...],  speculation: {...}
}) {
  render(ctx) { return HomeApp; }               // RouteContext {path,params,query,navigate}; returns class | instance | HTML string
  @Page.get("/stats") stats(ctx) { return this.json({ online: 1 }); }  // co-located sub-route
  @Page.post() submit(ctx) { return this.redirect("/"); }              // mutation (303 PRG)
}

mountPages(Application(), Home).listen(3010, () => {});
```

- `render()` gets an **isomorphic** `RouteContext` (path/params/query/navigate), not the
  server `Context` — the same `render()` can run on the server and in an SPA. `@Page.*`
  mutation/sub-route handlers get the full server `Context`.
- `Page.url` is the page's GET path, exposed for cross-page links (refactor-safe).
- Helpers on the instance: `this.json(data)`, `this.redirect(loc, status=303)`.

## 5. The ssr() server plugin (preferred when you want SEO modules)

```ts
import { ssr } from "@youneed/server-plugin-ssr";

Application()
  .plugin(ssr({
    origin: "https://example.com",
    pages: [Home, About],
    devtools: true,                              // embeds page/route payload (dev only)
    modules: [/* robots(), sitemap(), … — see ssg.md */],
  }))
  .listen(3000, () => {});
```

`mountPages` wraps the server *into* an SSR host; `ssr()` inverts it — SSR is a
`ServerPlugin` and the plugin owns the page list (the route-table source the satellite
modules enumerate). Same Page classes either way.

## 6. Client hydration

Each SSR'd ready-instance emits `<script type="application/json" data-hydrate>{tag,props}</script>`.
On the client, import the components (so the custom elements upgrade) and call hydrate:

```ts
import { hydrate } from "@youneed/dom";
import "./components.ts";   // defines <home-app> etc. → declarative-shadow markup upgrades
hydrate();                  // reads data-hydrate blocks, assigns props → reactive re-render
```

Assigning a hydrated `@prop` re-renders with the data, whether the element upgraded
already or later. `mode: "client"` Pages emit only the shell (no server `render()`),
leaving the browser to render the body.

## 7. SSR routing — outlet() + client SPA router

Render the page into a shared layout shell with an outlet hole; the client router then
swaps only the outlet on navigation (partial routing — header/footer stay put).

```ts
// SERVER: layout option splices the body into the outlet hole
import { outlet } from "@youneed/ssr-router";        // re-exports @youneed/dom-router
const SHELL = `<nav>…</nav>${outlet()}<footer>…</footer>`;
class Home extends Page("/", { title: "Home", layout: SHELL }) { render() { return HomeApp; } }

// CLIENT: take over navigation only if the outlet is present
import { createRouter, OUTLET_SELECTOR } from "@youneed/dom-router";
if (document.querySelector(OUTLET_SELECTOR)) {
  createRouter({
    outlet: OUTLET_SELECTOR,
    mode: "history",                                  // "hash" (default) | "history" | "query"
    routes: [{ path: "/", component: HomeApp }, { path: "/about", component: AboutApp }],
  });
}
```

`createRouter` → `Router`: `navigate(path,{replace?})`, `current` (`{path,params,query,route}`),
`refresh()`, `destroy()`. Paths: `/users/:id` (named), `/files/*` and `*` (catch-all →
`params["*"]`). `createMatcher(routes)` is the pure DOM-free matcher (reusable on the server).

## 8. Error / 404 pages

`@youneed/ssr-router`'s `router()` is an `SsrModule` that installs one global middleware:
a default 404 re-renders as your `notFound` Page (status 404); a thrown render re-renders
as your `error` Page (status 500, with `ctx.error` set).

```ts
import { router, catchAll } from "@youneed/ssr-router";
ssr({ pages: [Home], modules: [router({ notFound: NotFound, error: ErrorPage })] });
// client-side 404: catchAll(NotFoundComp) → a { path: "*", component } route
```
