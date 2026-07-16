# @youneed/server-middleware-compression

gzip/brotli the response when the client accepts it and the body is worth
compressing. It buffers the response (intercepting `res.write`/`res.end`), so it
suits typical JSON/text/HTML payloads rather than very large streams.

```ts
import { Application } from "@youneed/server";
import { compression } from "@youneed/server-middleware-compression";

Application()
  .use(compression({ threshold: 1024 }))
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `threshold` | `1024` | minimum body size (bytes) before compressing |
| `brotli` | `true` | prefer brotli when the client supports it |

> Sets `Content-Encoding`, recomputes `Content-Length`, and appends
> `Accept-Encoding` to `Vary`. Bodies below `threshold`, already-encoded
> responses, and non-compressible content types are passed through untouched.
