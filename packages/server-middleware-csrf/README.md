# @youneed/server-middleware-csrf

Stateless CSRF protection using the double-submit cookie pattern. A token cookie
is issued on safe requests; on unsafe verbs the same token must be echoed back in
a header (or `body._csrf`), so a cross-site request can't forge it.

```ts
import { Application } from "@youneed/server";
import { csrf } from "@youneed/server-middleware-csrf";

Application()
  .use(csrf())                                  // global, default options
  .use("/admin", csrf({ cookieName: "admin_csrf" })) // scoped, custom cookie
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `cookieName` | `"csrf"` | name of the token cookie |
| `headerName` | `"x-csrf-token"` | request header carrying the echoed token |
| `protectedMethods` | `["POST", "PUT", "PATCH", "DELETE"]` | verbs that require a matching token |
| `token` | 36 hex chars (`randomBytes(18)`) | token generator |
| `cookie` | `{ sameSite: "Lax", path: "/" }` | attributes for the CSRF cookie (NOT HttpOnly — the client must read it) |

> The token is exposed on `ctx.state.csrf` so handlers can embed it in a form or
> page. The cookie is intentionally not HttpOnly so the client can read it and
> echo it back in the header.
