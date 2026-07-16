# @youneed/server-middleware-etag

Add an `ETag` to GET/HEAD responses and answer `If-None-Match` with `304 Not
Modified`, so unchanged resources skip re-sending the body. Hashes
string/buffer/JSON bodies; streams are left untouched.

```ts
import { Application } from "@youneed/server";
import { etag } from "@youneed/server-middleware-etag";

Application()
  .use(etag())                  // weak validators, global
  .use("/assets", etag({ weak: false })) // strong, scoped
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `weak` | `true` | emit weak validators `W/"…"` instead of strong tags |

> Only `200` GET/HEAD responses are tagged; non-200 results and already-sent
> responses pass through unchanged.
