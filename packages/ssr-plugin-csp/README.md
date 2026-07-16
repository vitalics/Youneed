# @youneed/ssr-plugin-csp

Content-Security-Policy tuned for SSR — for [`@youneed/server`](../server),
exposed as an SSR module for [`@youneed/server-plugin-ssr`](../server-plugin-ssr).

SSR injects several **inline** scripts (hydration JSON, speculation rules,
JSON-LD, the devtools payload). A strict CSP blocks inline scripts unless they
carry a matching nonce — so this middleware, for **document** responses only
(`Accept: text/html`):

1. generates a per-request nonce,
2. rewrites the document's `<script>` tags to carry it,
3. sets `Content-Security-Policy` with `'nonce-…'` in `script-src`.

API/asset traffic is left untouched and unbuffered.

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { csp } from "@youneed/ssr-plugin-csp";

app.plugin(ssr({
  pages: [Home],
  modules: [csp({ directives: { "img-src": ["'self'", "https://cdn.example.com"] } })],
}));
```

Or as plain server middleware:

```ts
import { cspMiddleware, getNonce } from "@youneed/ssr-plugin-csp";

app.use(cspMiddleware({ reportOnly: true, styleNonce: true }));
// inside a handler: getNonce(ctx) → the per-request nonce
```

Options: `directives` (merged over the defaults; a key replaces a directive
whole, `false` drops it), `reportOnly`, `nonce` (default `true`), `styleNonce`
(default `false` — shadow-DOM styles make blanket style nonces unreliable),
`reportUri`.

## Build

```sh
pnpm --filter @youneed/ssr-plugin-csp run build
```
