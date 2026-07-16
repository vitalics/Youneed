# @youneed/server-middleware-trust-proxy

Resolve the real client **IP / protocol / host** from
[`X-Forwarded-*`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For)
headers when the app sits behind a load balancer / reverse proxy / CDN.

```ts
import { Application, Response } from "@youneed/server";
import { trustProxy, clientInfo } from "@youneed/server-middleware-trust-proxy";

const app = Application()
  .use(trustProxy({ hops: 1 }))                  // 1 trusted proxy in front
  .get("/whoami", (ctx) => Response.json(clientInfo(ctx)));
  // → { ip: "1.2.3.4", protocol: "https", host: "api.example.com" }
```

> Trusting `X-Forwarded-*` blindly is a spoofing vector — any client can set them.
> Only enable `trust` when a proxy you control rewrites/appends these headers.

## API

- **`trustProxy(opts?)`** — middleware. Resolves the client view and stores it on
  `ctx.state`, exposed via {@link clientInfo}`(ctx)`. Register early. Options:
  - `trust` — trust the forwarded headers at all (default `true`). When `false`,
    everything is derived from the socket.
  - `hops` — number of trusted proxy hops in front of the app (default `1`).
    `X-Forwarded-For` is a comma list `client, proxy1, proxy2` where each proxy
    *appends* the address it saw; the genuine client is the entry `hops` positions
    from the **right**.

- **`clientInfo(ctx)`** — read the resolved `{ ip, protocol, host }` for the request
  (a socket-derived default when the middleware isn't installed):
  - `ip` — `X-Forwarded-For` (honoring `hops`) when trusted, else `socket.remoteAddress`.
  - `protocol` — `X-Forwarded-Proto` when trusted, else `socket.encrypted ? "https" : "http"`.
  - `host` — `X-Forwarded-Host` when trusted, else the `Host` header.

- **`ClientInfo`** — the `{ ip, protocol, host }` result type.
