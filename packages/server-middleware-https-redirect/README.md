# @youneed/server-middleware-https-redirect

Force [HTTPS](https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security)
and apply canonical host / trailing-slash redirects in a single hop, before any
handler runs.

```ts
import { Application, Response } from "@youneed/server";
import { httpsRedirect } from "@youneed/server-middleware-https-redirect";

const app = Application()
  .use(httpsRedirect({ host: "example.com", trailingSlash: "never" }))
  .get("/users", () => Response.json([/* … */]));

// http://www.example.com/users/  →  308  Location: https://example.com/users
```

## API

- **`httpsRedirect(opts?)`** — middleware. Redirects to the canonical
  `https://<host><path>` when the request isn't secure, or its host / path isn't
  canonical; otherwise falls through to `next()`. Options:
  - `status` — redirect status (default `308`, which preserves the method & body;
    use `301` for a permanent GET-style redirect).
  - `trustProxy` — trust `X-Forwarded-Proto` / `X-Forwarded-Host` from an upstream
    proxy (default: on). With it on, `X-Forwarded-Proto: https` is treated as
    secure. Set `false` to only trust a directly-TLS socket.
  - `host` — force a canonical host (e.g. `www.x.com` → `x.com`). A request whose
    host differs is redirected to this host.
  - `trailingSlash` — `"always"` appends a trailing slash, `"never"` strips it
    (the root `/` is always left intact).

  A request is **secure** when the socket is TLS-encrypted (`socket.encrypted`),
  or — behind a trusted proxy — when `X-Forwarded-Proto: https` is set. All
  normalizations are folded into one redirect.
