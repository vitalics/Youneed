// @youneed/server middleware — serve static files from disk, with HTTP `Range`
// support (so browsers can seek <video>/<audio>, resume downloads, etc.).
//
//   app.use(staticFiles("public", { cacheControl: "public, max-age=3600" }));
//
// Only handles GET/HEAD; everything else (and any miss — not found, directory
// without an index, a path-traversal attempt) falls through via `next()`, so it
// composes cleanly with your routes. Each hit gets `ETag` + `Last-Modified` for
// conditional requests (`If-None-Match` → `304`) and always advertises
// `Accept-Ranges: bytes`; a valid `Range` is answered with `206 Partial Content`.
import type { Context, Middleware } from "@youneed/server";
import { Response } from "@youneed/server";
import { createReadStream, statSync, type Stats } from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

export interface StaticOptions {
  /** File served when the resolved path is a directory (default `"index.html"`). */
  index?: string;
  /** Value for the `Cache-Control` response header (set only when provided). */
  cacheControl?: string;
}

/** Extension → `Content-Type`. Unknown extensions get `application/octet-stream`. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function contentType(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** `"size-mtime"` (both hex) — a cheap, change-detecting ETag. */
function etagOf(stat: Stats): string {
  return `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
}

/**
 * Parse a single-range `Range: bytes=START-END` header against `size`.
 * Returns `null` when there's no usable range (treat as a full response),
 * or `"unsatisfiable"` when the syntax is fine but the range is out of bounds.
 * Supports `bytes=START-`, `bytes=START-END`, and `bytes=-SUFFIX` (last N bytes).
 */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // malformed / multi-range → fall back to a full response
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix range: last `rawEnd` bytes
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
    if (end > size - 1) end = size - 1; // clamp to EOF
  }
  if (start > end || start >= size || start < 0) return "unsatisfiable";
  return { start, end };
}

/**
 * Serve static files from `root`. Register it where you want the assets mounted
 * (typically before your API routes). A miss returns `next()` so the next
 * middleware/route can handle it.
 */
export function staticFiles(root: string, opts: StaticOptions = {}): Middleware {
  const rootDir = resolve(root);
  const index = opts.index ?? "index.html";

  return async (ctx: Context, next) => {
    const req = ctx.request;
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") return next();

    // Strip query/hash, decode, and reject anything that escapes `root`.
    const rawPath = (req.url ?? "/").split("?")[0].split("#")[0];
    let pathname: string;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      return next();
    }
    const joined = normalize(join(rootDir, pathname));
    const rel = relative(rootDir, joined);
    if (rel === ".." || rel.startsWith(`..${sep}`) || (rel !== "" && resolve(rootDir, rel) !== joined)) {
      return next(); // path traversal — refuse to serve
    }

    // Stat; if it's a directory, look for the index file inside it.
    let filePath = joined;
    let stat: Stats;
    try {
      stat = statSync(filePath);
      if (stat.isDirectory()) {
        filePath = join(filePath, index);
        stat = statSync(filePath);
      }
    } catch {
      return next(); // missing
    }
    if (!stat.isFile()) return next();

    const size = stat.size;
    const etag = etagOf(stat);
    const headers: Record<string, string> = {
      "Content-Type": contentType(filePath),
      "ETag": etag,
      "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
      "Accept-Ranges": "bytes",
    };
    if (opts.cacheControl) headers["Cache-Control"] = opts.cacheControl;

    // Conditional request: a matching validator means the client's copy is fresh.
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return Response({ status: 304, headers });
    }

    const isHead = method === "HEAD";
    const range = parseRange(req.headers["range"] as string | undefined, size);

    if (range === "unsatisfiable") {
      return Response({ status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }

    if (range) {
      const { start, end } = range;
      const length = end - start + 1;
      const partialHeaders = {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(length),
      };
      return Response({
        status: 206,
        headers: partialHeaders,
        body: isHead ? undefined : createReadStream(filePath, { start, end }),
      });
    }

    return Response({
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
      body: isHead ? undefined : createReadStream(filePath),
    });
  };
}
