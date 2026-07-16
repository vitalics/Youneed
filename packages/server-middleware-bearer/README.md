# @youneed/server-middleware-bearer

Bearer-token authentication for `@youneed/server`. Validates the
`Authorization: Bearer <token>` header, resolves the token to a principal via
your `verify` callback, and stashes the result on `ctx.state` (so downstream
handlers can read it). Rejects with `401 Unauthorized` when the token is missing
or invalid, advertising a `WWW-Authenticate` challenge.

```ts
import { Application } from "@youneed/server";
import { bearer } from "@youneed/server-middleware-bearer";

Application()
  .use(bearer({
    verify: async (token) => {
      const user = await lookupSession(token);
      return user ?? false; // false/null → 401
    },
  }))
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `verify` | — (required) | resolve a token to a principal; return `false`/`null` to reject |
| `optional` | `false` | allow requests without a (valid) token to pass through |
| `realm` | `"api"` | `WWW-Authenticate` realm advertised on a 401 |
| `stateKey` | `"user"` | key under `ctx.state` where the principal is stored |
