# @youneed/server-middleware-accept-language

Server-driven [content negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Content_negotiation)
on the `Accept-Language` header for `@youneed/server`. Parses the header's
weighted language tags, picks the best match from the locales you actually ship,
stashes it on `ctx.state.locale`, and advertises the choice with
`Content-Language` (+ `Vary: Accept-Language`).

```ts
import { Application, Response } from "@youneed/server";
import { acceptLanguage } from "@youneed/server-middleware-accept-language";
import { i18n } from "./i18n.ts"; // an @youneed/i18n instance

Application()
  .use(acceptLanguage({ supported: ["en", "de", "fr"], default: "en", i18n }))
  .get("/", (ctx) => Response.text(`locale: ${ctx.state.locale}`))
  .listen(3000, () => {});
```

Matching is case-insensitive and language-aware: `de-AT` matches supported `de`
(primary-subtag fallback), `q=0` rejects a tag, and `*` (when nothing else
matched) takes the highest-priority supported locale. Pass an `i18n` translator
to set its active locale per request.

Also exports the pure helpers `parseAcceptLanguage(header)` and
`negotiateLanguage(header, supported)` for use outside the middleware.

| option | default | meaning |
| --- | --- | --- |
| `supported` | — (required) | locales you ship, most-preferred first |
| `default` | `supported[0]` | fallback when the header is absent / matches nothing |
| `stateKey` | `"locale"` | key under `ctx.state` for the negotiated locale |
| `i18n` | — | translator whose `setLocale` is called per request |
| `contentLanguage` | `true` | emit the `Content-Language` response header |
| `vary` | `true` | append `Accept-Language` to `Vary` |
