# @youneed/dom-router

A tiny client-side SPA router that mounts a Custom Element into an outlet when
the URL matches. Three URL strategies — **hash**, **history**, **query** — behind
one API. Pairs naturally with [`@youneed/dom`](../dom) components (a route's
`component` is a tag name **or a component class**), but depends on neither.

## Install

```bash
pnpm add @youneed/dom-router
```

## Use

```ts
import { createRouter } from "@youneed/dom-router";

const router = createRouter({
  outlet: document.getElementById("app")!,
  mode: "history",                 // "hash" (default) · "history" · "query"
  routes: [
    { path: "/",            component: HomePage },       // a component CLASS…
    { path: "/users/:id",   component: "user-page" },    // …or a tag string. params: { id }
    { path: "*",            component: "not-found" },     // catch-all
  ],
});

router.navigate("/users/42");      // updates the URL + mounts <user-page>
router.current?.params;            // { id: "42" }
```

Intercept link clicks yourself and call `router.navigate(href)`, or wire it to
your UI however you like.

## API

- **`createRouter(options): Router`** — `options`: `routes`, `outlet`, `mode`,
  `base` (prefix for history mode), `queryKey` (the query param holding the path
  in query mode, default `"page"`).
- **`Router`** — `navigate(path, { replace? })`, `current` (the latest
  `RouteMatch`: `path` / `params` / `query` / `route`), `refresh()`, `destroy()`.
- **`createMatcher(routes)`** — the pure matching function (no DOM/outlet); usable
  on the server for SSR route resolution and easy to test/bench.

Path syntax: `/`, `/users/:id` (named param), `/files/*` and `*` (catch-all into
`params["*"]`).

## Examples

```bash
pnpm examples:serve:router-hash
pnpm examples:serve:router-query
pnpm examples:serve:router-slash    # history mode (SPA fallback)
```
