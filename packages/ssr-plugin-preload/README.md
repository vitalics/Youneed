# @youneed/ssr-plugin-preload

Resource hints (`<link rel="preload"/modulepreload/preconnect/dns-prefetch/prefetch">`)
as SSR page middleware for [`@youneed/ssr`](../ssr).

Complements [`@youneed/ssr-plugin-speculation`](../ssr-plugin-speculation):
speculation prefetches whole **pages**; this declares the **resources** the
current page needs early. A page declares hints via the `preload` option (added
to `PageOptions`).

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { preload } from "@youneed/ssr-plugin-preload";

class Home extends Page("/", {
  preload: [
    { rel: "preload", href: "/fonts/inter.woff2", as: "font", type: "font/woff2", crossorigin: true },
    { rel: "modulepreload", href: "/client.js" },
  ],
}) { /* … */ }

app.plugin(ssr({
  origin: "https://example.com",
  pages: [Home],
  modules: [preload({ hints: [{ rel: "preconnect", href: "https://cdn.example.com" }] })],
}));
```

`preconnect`/`dns-prefetch` hrefs are used verbatim; the rest resolve to absolute
URLs against `origin`. Site-wide `hints` are emitted on every page.

## Build

```sh
pnpm --filter @youneed/ssr-plugin-preload run build
```
