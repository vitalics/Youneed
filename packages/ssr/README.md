# @youneed/ssr

Server-side rendering for [`@youneed/dom`](../dom) components (emitted as native
**Declarative Shadow DOM**, so markup hydrates without JS), plus the **`Page`**
entity — the document-level twin of a `Controller`, with first-class
**Speculation Rules**.

## Install

```bash
pnpm add @youneed/ssr
```

> Components `extends HTMLElement` at import, so register a server DOM
> (happy-dom) **before** importing this package:
> ```ts
> import { GlobalRegistrator } from "@happy-dom/global-registrator";
> GlobalRegistrator.register();
> const { renderToString, Page } = await import("@youneed/ssr");
> ```

## Render a component

```ts
import { renderToString, renderPage } from "@youneed/ssr";

renderToString(MyComponent);             // → "<my-el><template shadowrootmode>…</template></my-el>"
renderPage(MyComponent, { title: "Home", clientScript: "/client.js" }); // full <!doctype html>
```

## Pages

```ts
import { Page, mountPages, enablePageDevtools } from "@youneed/ssr";
import { Application } from "@youneed/server";

class About extends Page("/about", { title: "About" }) {
  render() { return AboutApp; }                  // a component class, instance, or HTML string
}

class Home extends Page("/", {
  title: "Home",
  clientScript: () => import("./client.ts"),     // type-checked; resolved to a URL
  speculation: { prerender: [{ source: "list", urls: [About.url], eagerness: "moderate" }] },
}) {
  render() { return HomeApp; }
}

enablePageDevtools();                            // embed page+routes payload (dev)
mountPages(Application(), Home, About).listen(3010, …);
```

## What you get

- **`renderToString(ComponentClass | instance)`** — Declarative Shadow DOM with
  inlined `adoptedStyleSheets`; flushes deferred `@Component.define(when)` first.
- **Document builders** — `Html`, `Head`, `Body`, `Title`, `Meta`, `Link`,
  `Script`, and the `renderPage(...)` convenience.
- **`Page(url, options)`** — `render(ctx)` returns the body; `@Page.get/post/...`
  co-locate extra routes; cross-page links via `Page.url`.
- **Speculation Rules** — `options.speculation` (value or thunk for forward refs)
  is injected as `<script type="speculationrules">`; `speculationScript`.
- **`clientScript`** — a URL string or a `() => import("…")` thunk
  (`clientScriptUrl` derives the served path).
- **Mounting** — `mountPages(app, ...Pages)`; `renderPageToString` for SSG;
  `routeTable` for the route map.
- **Devtools payload** — `enablePageDevtools()` / `DEVTOOLS_MARKER` feed the
  Page/Routes/Map tabs in [`@youneed/devtools`](../devtools).

## Examples

```bash
pnpm examples:ssr     # SSR a single component
pnpm examples:pages   # Pages + Speculation Rules + devtools
pnpm examples:ssg     # static generation
pnpm examples:video   # islands: SSR markup + client-only state
```
