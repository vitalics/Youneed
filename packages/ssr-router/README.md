# @youneed/ssr-router

Routing for the [`@youneed/ssr`](../ssr) stack — **one route table, both sides**:

- **Server** — an `ssr()` **module** that adds Error / 404 pages. It re-renders
  the framework's default 404 as your `notFound` page (status 404) and catches a
  thrown render as your `error` page (status 500).
- **Client** — re-exports [`@youneed/dom-router`](../dom-router)
  (`createRouter`/`createMatcher`/`outlet`/`routerProvider`) for SPA navigation,
  plus `catchAll(component)` for a client-side 404 route.

## Install

```bash
pnpm add @youneed/ssr-router
```

## Server: Error / 404 pages

`router()` is an SSR module — pass it in `modules: [...]` to the
[`@youneed/server-plugin-ssr`](../server-plugin-ssr) `ssr()` plugin. It installs
**one global middleware**: a default 404 response becomes the `notFound` page; a
thrown render becomes the `error` page (with the error exposed on the server
context for dev pages). Both are plain `Page`s — rendered directly, **not**
mounted as public routes.

```ts
import { Application } from "@youneed/server";
import { ssr } from "@youneed/server-plugin-ssr";
import { router } from "@youneed/ssr-router";
import { Home, Blog, NotFound, ErrorPage } from "./pages";

const app = Application();
app.plugin(
  ssr({
    pages: [Home, Blog],
    modules: [router({ notFound: NotFound, error: ErrorPage })],
  }),
);
app.listen(3000, () => {});
```

`SsrRouterOptions`: `notFound?` (Page rendered for unmatched URLs, status 404),
`error?` (Page rendered when a page/command render throws, status 500). Both are
optional — omit `error` and thrown renders propagate as before.

## Client: SPA navigation

The client side is `@youneed/dom-router`, re-exported so a route table can be
shared with the server. Build a router and add a catch-all 404:

```ts
import { createRouter, catchAll } from "@youneed/ssr-router";
import { Home, Blog, NotFound } from "./pages";

const router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/blog/:slug", component: Blog },
    catchAll(NotFound), // = { path: "*", component: NotFound }
  ],
});
```

## API

- **`router(options?)` → `SsrModule`** — server module adding Error/404 handling.
  `options`: `{ notFound?, error? }` (both `PageClass`).
- **`catchAll(component)` → `RouteDef`** — a `{ path: "*" }` route for a
  client-side 404.
- **Re-exported from [`@youneed/dom-router`](../dom-router):** `createRouter`,
  `createMatcher`, `outlet`, `OUTLET_MARKER`, `OUTLET_SELECTOR`, `routerProvider`,
  and the types `Router`, `RouteDef`, `RouteMatch`, `RouterMode`, `RouterApi`,
  `DomRouterOptions`.

Built on [`@youneed/server`](../server), [`@youneed/ssr`](../ssr),
[`@youneed/server-plugin-ssr`](../server-plugin-ssr) and
[`@youneed/dom-router`](../dom-router).
