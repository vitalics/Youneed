# @youneed/ssr-plugin-meta

SEO `<meta>` + OpenGraph + Twitter Card tags as SSR page middleware for
[`@youneed/ssr`](../ssr). A page declares metadata via the `meta` option (added
to `PageOptions`); the middleware renders the tags. `og:url`/`og:image` resolve
to absolute URLs against the SSR `origin`.

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { meta } from "@youneed/ssr-plugin-meta";

class Post extends Page("/blog/:slug", {
  title: "Hello world",
  meta: {
    description: "An introductory post.",
    og: { type: "article", image: "/og/hello.png" },
    twitter: { card: "summary_large_image" },
  },
}) { /* … */ }

app.plugin(ssr({
  origin: "https://example.com",
  pages: [Post],
  modules: [meta({ siteName: "Example", twitterSite: "@example" })],
}));
```

`meta` can also be a function `(ctx) => MetaInput` for request-varying tags.
Plugin `defaults` are merged **under** each page's own meta.

## Build

```sh
pnpm --filter @youneed/ssr-plugin-meta run build
```
