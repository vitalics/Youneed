# @youneed/ssr-plugin-rss

An RSS 2.0 / Atom feed SSR module for [`@youneed/server-plugin-ssr`](../server-plugin-ssr).

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { rss } from "@youneed/ssr-plugin-rss";

app.plugin(
  ssr({
    origin: "https://example.com",
    modules: [
      rss({
        title: "Example Blog",
        description: "Latest posts",
        // value or (async) function — feed reflects fresh data per request
        items: () =>
          loadPosts().then((p) =>
            p.map((post) => ({
              title: post.title,
              link: `/blog/${post.slug}`,
              description: post.excerpt,
              pubDate: post.publishedAt,
              guid: post.id,
            })),
          ),
      }),
    ],
  }),
);
```

Pass `format: "atom"` for an Atom 1.0 feed (default path becomes `/atom.xml`).
Item links are resolved to absolute URLs against `origin`.

## Build

```sh
pnpm --filter @youneed/ssr-plugin-rss run build
```
