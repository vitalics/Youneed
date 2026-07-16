# @youneed/server-plugin-ssr

Add SSR to a `@youneed/server` app **from the outside** — as a plugin the server
opts into, instead of `@youneed/ssr`'s `mountPages(app, …)` which wraps the
server into an SSR host.

```ts
import { Application } from "@youneed/server";
import { ssr } from "@youneed/server-plugin-ssr";
import { robots } from "@youneed/ssr-plugin-robots";
import { sitemap } from "@youneed/ssr-plugin-sitemap";
import { rss } from "@youneed/ssr-plugin-rss";
import { llms } from "@youneed/ssr-plugin-llms";
import { structuredData, organization } from "@youneed/ssr-plugin-structured-data";

Application()
  .plugin(
    ssr({
      origin: "https://example.com",
      pages: [Home, About, Pricing], // @youneed/ssr Page classes
      devtools: true,
      modules: [
        robots({ sitemap: true }),
        sitemap({ defaults: { changefreq: "weekly" } }),
        rss({ title: "Blog", description: "Latest", items: loadItems }),
        llms({ title: "Example", includePages: true }),
        structuredData({ schemas: organization({ name: "Example" }) }),
      ],
    }),
  )
  .listen(3000, () => {});
```

## Satellite SSR modules

The plugin owns the page list — the single source of truth for the route table
that sitemaps, feeds and `llms.txt` enumerate. Satellite features
(`@youneed/ssr-plugin-*`) are **not** server plugins; they implement the
`SsrModule` contract and receive an `SsrModuleContext`:

| field          | what it gives                                              |
| -------------- | --------------------------------------------------------- |
| `app`          | register routes (`app.get("/robots.txt", …)`)             |
| `origin`       | configured absolute site origin                           |
| `routes`       | discovered page routes (`url`, `title`, `dynamic`)        |
| `absolute(p)`  | resolve a path to an absolute URL against `origin`        |
| `head(fn)`     | contribute entries to **every** page's `<head>` (JSON-LD) |

Write your own module by returning `{ name, setup(ctx) {…} }`.

## Build

```sh
pnpm --filter @youneed/server-plugin-ssr run build
```
