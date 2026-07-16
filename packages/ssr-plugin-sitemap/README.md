# @youneed/ssr-plugin-sitemap

A `sitemap.xml` SSR module for [`@youneed/server-plugin-ssr`](../server-plugin-ssr).

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { sitemap } from "@youneed/ssr-plugin-sitemap";

app.plugin(
  ssr({
    origin: "https://example.com",
    pages: [Home, About, Pricing],
    modules: [
      sitemap({
        exclude: ["/admin", /^\/internal/],
        entries: [{ url: "/blog/launch", lastmod: "2026-06-01", priority: 0.8 }],
        defaults: { changefreq: "weekly", priority: 0.5 },
      }),
    ],
  }),
);
```

Static page routes are enumerated automatically; dynamic routes (`/users/:id`)
are skipped — list those via `entries` (a value or an async function, so the
feed reflects fresh data on each request). All `<loc>`s are absolute against
`origin`.

## Build

```sh
pnpm --filter @youneed/ssr-plugin-sitemap run build
```
