# @youneed/server-middleware-static

Serve static files from disk, with HTTP [`Range`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Range)
support (so browsers can seek `<video>`/`<audio>` and resume downloads),
[`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) +
`Last-Modified` validators, and conditional `304` responses.

```ts
import { Application, Response } from "@youneed/server";
import { staticFiles } from "@youneed/server-middleware-static";

const app = Application()
  .use(staticFiles("public", { cacheControl: "public, max-age=3600" }))
  .get("/api/health", () => Response.json({ ok: true }));
```

Mount it before your routes. Any miss — a non-`GET`/`HEAD` method, a path that
isn't a file, a directory with no index, or a path-traversal attempt — falls
through via `next()`, so your routes still see the request.

## API

- **`staticFiles(root, opts?)`** — middleware serving files under `root`.
  - Only handles `GET` / `HEAD`; other methods fall through.
  - Resolves the request path under `root` and rejects path traversal (`..`).
  - Directories serve `opts.index` (default `"index.html"`).
  - Sets `Content-Type` from the extension, `ETag`, `Last-Modified`, and always
    `Accept-Ranges: bytes`.
  - `If-None-Match` matching the `ETag` → `304 Not Modified` (no body).
  - `Range: bytes=START-END` → `206 Partial Content` with `Content-Range` and
    only the requested bytes (supports `bytes=START-` and `bytes=-SUFFIX`); an
    out-of-bounds range → `416` with `Content-Range: bytes */SIZE`.

  Options:
  - `index` — file served for a directory (default `"index.html"`).
  - `cacheControl` — value for the `Cache-Control` header (set only when given).
