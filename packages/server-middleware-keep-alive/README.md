# @youneed/server-middleware-keep-alive

Advertise a [`Keep-Alive`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Keep-Alive)
response header, and drop the connection programmatically (e.g. on an abuse /
malware header).

```ts
import { Application, Response, HttpError } from "@youneed/server";
import { keepAlive, connection } from "@youneed/server-middleware-keep-alive";

const app = Application()
  .use(keepAlive({ timeout: 10, max: 1000 }))      // → Keep-Alive: timeout=10, max=1000
  .use((ctx, next) => {
    if (ctx.request.headers["x-malware"]) {
      connection(ctx).destroy();                    // sever the socket immediately
      throw new HttpError(403, { error: "blocked" });
    }
    return next();
  })
  .get("/users", () => Response.json([/* … */]));
```

## API

- **`keepAlive(opts?)`** — middleware. Sets `Keep-Alive: timeout=<s>[, max=<n>]` on
  responses, and exposes the per-request {@link connection} controller. Options:
  - `timeout` — advertised idle seconds (default `5`). Advisory; the real idle
    timeout is Node's `server.keepAliveTimeout`.
  - `max` — advertised max requests for the connection (omitted when unset).
  - `enabled(ctx)` — gate the header per request (default: on).

  Connection-specific, so it's a no-op on **HTTP/2 / HTTP/3** (where the header is
  forbidden / ignored).

- **`connection(ctx)`** — control the current connection (a no-op when the
  middleware isn't installed):
  - `close()` — **graceful**: send `Connection: close` (and omit `Keep-Alive`), so
    this response is delivered, then the socket closes.
  - `destroy()` — **abrupt**: tear the socket down right now (the in-flight response
    is aborted) — for abuse/malware.
  - `closing` — whether a close/destroy was requested.
