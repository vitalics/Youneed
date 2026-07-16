# @youneed/server-middleware-basic-auth

HTTP [Basic auth](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication)
and API-key auth middleware for `@youneed/server`. The resolved principal is
stashed on `ctx.state`, and rejected requests get a `401`.

```ts
import { Application, Response } from "@youneed/server";
import { basicAuth, apiKey } from "@youneed/server-middleware-basic-auth";

const app = Application()
  // Static user → password map (passwords compared in constant time).
  .use("/admin", basicAuth({ users: { alice: "s3cret" }, realm: "Admin" }))
  // …or your own verifier, returning a principal (or false to reject).
  .use("/api", apiKey({ verify: (key) => lookup(key), header: "x-api-key" }))
  .get("/admin/me", (ctx) => Response.json({ you: ctx.state.user }))
  .get("/api/data", (ctx) => Response.json({ key: ctx.state.apiKey }));
```

## API

- **`basicAuth(opts)`** — validates `Authorization: Basic <base64(user:pass)>`.
  Missing/invalid credentials → `401` with
  `WWW-Authenticate: Basic realm="<realm>", charset="UTF-8"`. Options:
  - `verify(user, pass, ctx)` — resolve credentials to a principal; return
    `false`/`null` to reject. **OR**
  - `users` — a static `user → password` map (passwords compared in constant
    time; the principal becomes `{ user }`).
  - `realm` — challenge realm (default `"Restricted"`).
  - `stateKey` — where to stash the principal on `ctx.state` (default `"user"`).

- **`apiKey(opts)`** — reads an API key from a header and/or query param,
  validates it. Missing/invalid → `401` (`{ error: "Unauthorized" }`). Options:
  - `verify(key, ctx)` — resolve a key to a principal; `false`/`null` rejects.
    **OR**
  - `keys` — a static list of accepted keys (compared in constant time; the
    principal becomes `{ key }`).
  - `header` — header to read the key from (default `"x-api-key"`).
  - `query` — query-param name to also read the key from (when set).
  - `stateKey` — where to stash the principal on `ctx.state` (default `"apiKey"`).
