// @youneed/server middleware — reject oversized request bodies. It checks the
// declared Content-Length up front (413 if too big) and stamps BODY_LIMIT on the
// request so the core body reader caps the streamed read at the same byte limit.
import { HttpError, BODY_LIMIT } from "@youneed/server";
import type { Middleware } from "@youneed/server";

export function bodyLimit(maxBytes: number | string): Middleware {
  const max = typeof maxBytes === "number" ? maxBytes : parseBytes(maxBytes);
  return (ctx, next) => {
    const declared = Number(ctx.request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > max) {
      throw new HttpError(413, { error: "Payload Too Large", limit: max });
    }
    (ctx.request as unknown as Record<symbol, number>)[BODY_LIMIT] = max;
    return next();
  };
}

const BYTE_UNITS: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
function parseBytes(s: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(s.trim());
  if (!m) throw new Error(`invalid byte size: ${s}`);
  return Math.floor(Number(m[1]) * (BYTE_UNITS[(m[2] ?? "b").toLowerCase()] ?? 1));
}
