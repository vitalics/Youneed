# @youneed/ssr-plugin-robots

A `robots.txt` SSR module for [`@youneed/server-plugin-ssr`](../server-plugin-ssr).

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { robots } from "@youneed/ssr-plugin-robots";

app.plugin(
  ssr({
    origin: "https://example.com",
    modules: [
      robots({
        policies: [
          { userAgent: "*", disallow: ["/admin", "/api"], allow: "/api/public" },
          { userAgent: ["GPTBot", "CCBot"], disallow: "/" },
        ],
        sitemap: true, // → Sitemap: https://example.com/sitemap.xml
        host: "example.com",
      }),
    ],
  }),
);
```

With no `policies`, it serves the permissive "allow everything" file. `sitemap`
accepts `true` (the conventional `/sitemap.xml`), or one/many explicit URLs
(resolved to absolute against `origin`).

## Build

```sh
pnpm --filter @youneed/ssr-plugin-robots run build
```
