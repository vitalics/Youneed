// @youneed/server middleware — gzip/brotli the response when the client accepts
// it and the body is worth it. Buffers the response (it intercepts res.write/end),
// so it suits typical JSON/text/HTML payloads rather than very large streams.
import { vary } from "@youneed/server";
import type { Middleware } from "@youneed/server";
import { gzip, brotliCompress } from "node:zlib";
import { Buffer } from "node:buffer";

const gzipAsync = (buf: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => gzip(buf, (e, r) => (e ? reject(e) : resolve(r))));
const brotliAsync = (buf: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => brotliCompress(buf, (e, r) => (e ? reject(e) : resolve(r))));

function isCompressibleType(ct: string): boolean {
  return /^(text\/|application\/(json|javascript|xml|.*\+json|.*\+xml))/.test(ct) || ct.includes("svg");
}

export interface CompressionOptions {
  /** Minimum body size (bytes) to bother compressing (default 1024). */
  threshold?: number;
  /** Prefer brotli when the client supports it (default true). */
  brotli?: boolean;
}

/**
 * gzip/brotli the response when the client accepts it and the body is worth it.
 * Buffers the response (it intercepts res.write/end), so it suits typical
 * JSON/text/HTML payloads rather than very large streams.
 */
export function compression(opts: CompressionOptions = {}): Middleware {
  const threshold = opts.threshold ?? 1024;
  const allowBrotli = opts.brotli !== false;
  return (ctx, next) => {
    const req = ctx.request;
    const res = ctx.response as any;
    const accept = String(req.headers["accept-encoding"] ?? "");
    const encoding = allowBrotli && /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
    if (!encoding) return next();

    const chunks: Buffer[] = [];
    const toBuf = (c: unknown, enc?: unknown) =>
      Buffer.isBuffer(c) ? c : Buffer.from(c as string, typeof enc === "string" ? (enc as BufferEncoding) : "utf8");
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk: unknown, enc?: unknown, cb?: unknown) => {
      if (chunk) chunks.push(toBuf(chunk, enc));
      if (typeof enc === "function") (enc as () => void)();
      else if (typeof cb === "function") (cb as () => void)();
      return true;
    };
    res.end = (chunk?: unknown, enc?: unknown, cb?: unknown) => {
      if (typeof chunk === "function") { cb = chunk; chunk = undefined; }
      else if (typeof enc === "function") { cb = enc; enc = undefined; }
      if (chunk) chunks.push(toBuf(chunk, enc));
      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      const ct = String(res.getHeader("Content-Type") ?? "");
      const restore = () => { res.write = origWrite; res.end = origEnd; };
      if (body.length < threshold || res.getHeader("Content-Encoding") || !isCompressibleType(ct)) {
        restore();
        return origEnd(body, cb as undefined);
      }
      (encoding === "br" ? brotliAsync(body) : gzipAsync(body)).then(
        (out) => {
          restore();
          res.setHeader("Content-Encoding", encoding);
          res.setHeader("Content-Length", String(out.length));
          res.setHeader("Vary", vary(res, "Accept-Encoding"));
          origEnd(out, cb as undefined);
        },
        () => { restore(); origEnd(body, cb as undefined); },
      );
      return res;
    };
    return next();
  };
}
