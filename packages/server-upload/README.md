# @youneed/server-upload

**Streaming** `multipart/form-data` file uploads for [`@youneed/server`](../server).
Unlike the core's buffered parser, it consumes the request as it arrives — so you
can pipe a file straight to disk/S3 **without holding it in memory**, report
**progress**, and reject a bad/oversized upload **early**, before it's fully
received. Built-in **guards** defend against zip-bombs, oversized payloads, path
traversal and disguised malware. Zero dependencies.

```ts
import { Response } from "@youneed/server";
import { parseUpload, UploadError } from "@youneed/server-upload";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import fs from "node:fs";

app.post("/upload", async (ctx) => {
  const form: Record<string, string> = {};
  try {
    for await (const part of parseUpload(ctx, {
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
      allowedExtensions: [".png", ".jpg", ".pdf"],
      allowedTypes: ["image/png", "image/jpeg", "application/pdf"],
      sniff: true,                                  // magic bytes vs declared type
      filenamePattern: /^[\w.\- ]+$/,
      onProgress: (p) => report(p.bytesReceived, p.totalBytes),
    })) {
      if (part.kind === "field") form[part.name] = part.value;
      else await pipeline(Readable.fromWeb(part.stream), fs.createWriteStream(`/tmp/${part.filename}`));
    }
    return { ok: true, fields: form };
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}, { body: false });                                // ← required: handler reads the stream
```

## `{ body: false }` is required

The core buffers the body for POST/PUT/PATCH by default. Pass `{ body: false }` as
the route schema so it **doesn't** drain the request — leaving the stream for the
handler. (This also enables raw-stream handlers in general: proxying, custom
parsers, etc.)

## Two APIs

- **`parseUpload(ctx, opts)`** — async generator yielding each `field` and `file`
  in order. Each `UploadFile` exposes a web **`ReadableStream` (`.stream`)** or
  **`.buffer()`**; consume exactly one, fully, before the next part (unconsumed
  files are auto-drained).
- **`collectUpload(ctx, opts)`** — convenience that buffers everything into
  `{ fields, files: [{ name, filename, contentType, data: Buffer }] }`. Guards
  still abort oversized files early.

## Guards (the security surface)

| option | protects against |
| --- | --- |
| `maxFileSize` (10 MiB) | oversized / decompression bombs — aborts mid-stream |
| `maxTotalBytes` | request-body amplification |
| `maxFiles` (20) / `maxFields` (100) / `maxFieldSize` (1 MiB) | part-count / field floods |
| `allowedExtensions` | executable / unexpected file types by name |
| `allowedTypes` | unexpected declared `Content-Type` |
| `filenamePattern` + `sanitizeFilename` | path traversal, control chars, weird names |
| `sniff` + `sniffType` | a `.zip`/malware **disguised** as `.png` (magic-byte check) |

A violated guard throws **`UploadError`** with an HTTP `status` (400/413/415) — map
it to a response as shown above. Filenames are always sanitized (directory
components and control characters stripped) before they reach you.

## Progress

`onProgress({ bytesReceived, totalBytes? })` fires as chunks arrive; `totalBytes`
comes from `Content-Length` when the client sends it (browsers do for
`XMLHttpRequest`/`fetch` uploads), so you can drive a progress bar.

## Helpers

`sanitizeFilename(name)` and `sniffType(headBytes)` are exported for reuse.
