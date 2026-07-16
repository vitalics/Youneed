# @youneed/server-middleware-body-limit

Reject oversized request bodies. The declared `Content-Length` is checked up
front (`413 Payload Too Large`), and the limit is stamped on the request so the
core body reader caps the streamed read at the same byte count.

```ts
import { Application } from "@youneed/server";
import { bodyLimit } from "@youneed/server-middleware-body-limit";

Application()
  .use(bodyLimit("5mb"))
  .listen(3000, () => {});
```

> Accepts a number of bytes or a size string like `"5mb"` (`b`, `kb`, `mb`, `gb`).
