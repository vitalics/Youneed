// @youneed/server middleware — add an `ETag` to GET/HEAD responses and answer
// `If-None-Match` with `304 Not Modified`. Hashes string/buffer/JSON bodies; skips streams.
import { Response, isResult } from "@youneed/server";
import type { Middleware, HttpResult } from "@youneed/server";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";

export interface EtagOptions {
  /** Emit weak validators `W/"…"` (default true). */
  weak?: boolean;
}

function etagMatches(ifNoneMatch: string, tag: string): boolean {
  if (ifNoneMatch.trim() === "*") return true;
  const bare = (t: string) => t.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => bare(t) === bare(tag));
}

/**
 * Adds an `ETag` to GET/HEAD responses and answers `If-None-Match` with `304
 * Not Modified` (empty body) when it matches. Hashes string/buffer/JSON bodies;
 * skips streams.
 */
export function etag(opts: EtagOptions = {}): Middleware {
  const weak = opts.weak !== false;
  return async (ctx, next) => {
    const result = await next();
    const req = ctx.request;
    const res = ctx.response;
    if (res.headersSent) return result;
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") return result;
    if (isResult(result) && result.status !== 200) return result;

    const body = isResult(result) ? result.body : result;
    if (body == null || body instanceof Readable) return result;
    let buf: Buffer;
    if (Buffer.isBuffer(body)) buf = body;
    else if (typeof body === "string") buf = Buffer.from(body);
    else {
      try {
        buf = Buffer.from(JSON.stringify(body));
      } catch {
        return result;
      }
    }

    const hash = createHash("sha1").update(buf).digest("base64url").slice(0, 27);
    const tag = `${weak ? "W/" : ""}"${buf.length.toString(16)}-${hash}"`;
    res.setHeader("ETag", tag);

    const inm = req.headers["if-none-match"];
    if (typeof inm === "string" && etagMatches(inm, tag)) {
      return Response({ status: 304 });
    }
    return result;
  };
}
