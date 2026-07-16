# @youneed/ssr-plugin-canonical

`<link rel="canonical">` + hreflang alternates as SSR page middleware for
[`@youneed/ssr`](../ssr).

By default every page gets a canonical link derived from the SSR `origin` + the
request path. Override or opt out per page via the `canonical` option (added to
`PageOptions`); declare hreflang variants via `alternates`.

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { canonical } from "@youneed/ssr-plugin-canonical";

class Pricing extends Page("/pricing", {
  canonical: "/pricing",                 // string | false | (ctx) => string
  alternates: [{ hreflang: "de", href: "/de/preise" }],
}) { /* … */ }

app.plugin(ssr({
  origin: "https://example.com",
  pages: [Pricing],
  modules: [canonical({ trailingSlash: "strip" })],
}));
```

Set `auto: false` to only emit canonical for pages that declare one.

## Build

```sh
pnpm --filter @youneed/ssr-plugin-canonical run build
```
