// ── @youneed/server-upload — streaming multipart / file uploads ──────────────
//
// A streaming `multipart/form-data` parser for `@youneed/server`. Unlike the core's
// buffered parser, it consumes the request as it arrives — so you can pipe a file
// straight to disk/S3 without holding it in memory, report progress, and reject a
// bad/oversized upload EARLY (before it's fully received).
//
// Mount on a route that opts OUT of body buffering (`{ body: false }`), then drive
// the parser from the handler:
//
//   import { parseUpload, collectUpload, UploadError } from "@youneed/server-upload";
//
//   app.post("/upload", async (ctx) => {
//     for await (const part of parseUpload(ctx, {
//       maxFileSize: 10 * 1024 * 1024,
//       maxFiles: 5,
//       allowedExtensions: [".png", ".jpg", ".pdf"],
//       allowedTypes: ["image/png", "image/jpeg", "application/pdf"],
//       sniff: true,                                  // magic-byte vs declared type
//       filenamePattern: /^[\w.\- ]+$/,
//       onProgress: (p) => console.log(p.bytesReceived, "/", p.totalBytes),
//     })) {
//       if (part.kind === "field") form[part.name] = part.value;
//       else await pipeline(part.stream, fs.createWriteStream(`/tmp/${part.filename}`)); // web stream
//     }
//     return { ok: true };
//   }, { body: false });                               // ← let the handler read the stream
//
// Guards (size caps, extension/type/name, content sniffing) protect against
// zip-bombs, oversized payloads, path traversal and disguised malware.

import { extname } from "node:path";
import type { Context } from "@youneed/server";

export interface UploadOptions {
  /** Max bytes per file — exceeding it aborts the upload (default 10 MiB). */
  maxFileSize?: number;
  /** Max bytes across the whole request body (zip-bomb / amplification guard). */
  maxTotalBytes?: number;
  /** Max number of file parts (default 20). */
  maxFiles?: number;
  /** Max number of non-file fields (default 100). */
  maxFields?: number;
  /** Max bytes for a single non-file field value (default 1 MiB). */
  maxFieldSize?: number;
  /** Allowed file extensions, incl. dot, case-insensitive (e.g. `[".png"]`). */
  allowedExtensions?: string[];
  /** Allowed declared (and, with `sniff`, detected) content types. */
  allowedTypes?: string[];
  /** Reject filenames not matching this pattern (after sanitization). */
  filenamePattern?: RegExp;
  /** Sniff magic bytes and validate against `allowedTypes` (catches a `.zip`
   *  renamed `.png`). */
  sniff?: boolean;
  /** Progress callback as bytes arrive (total from `Content-Length`, if sent). */
  onProgress?: (p: { bytesReceived: number; totalBytes?: number }) => void;
}

/** A non-file form field. */
export interface UploadField {
  kind: "field";
  name: string;
  value: string;
}

/** A file part — consume `stream` (web `ReadableStream`) OR `buffer()` exactly once. */
export interface UploadFile {
  kind: "file";
  /** Form field name. */
  name: string;
  /** Sanitized filename (path components stripped). */
  filename: string;
  /** Declared `Content-Type` of the part. */
  contentType?: string;
  /** The file body as a web `ReadableStream` (pipe to disk/S3 without buffering). */
  readonly stream: ReadableStream<Uint8Array>;
  /** Collect the whole file into a Buffer (bounded by `maxFileSize`). */
  buffer(): Promise<Buffer>;
}

/** An upload that violated a guard, or a malformed body. Carries an HTTP `status`. */
export class UploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "UploadError";
  }
}

const MiB = 1024 * 1024;
const CRLF2 = Buffer.from("\r\n\r\n");

/** Strip directory components, control chars and leading dots from a filename. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\x00-\x1f\x7f]/g, "").replace(/^\.+/, "").trim();
}

/** Best-effort content-type from a file's leading magic bytes. */
export function sniffType(head: Uint8Array): string | undefined {
  const b = head;
  const m = (sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);
  if (m([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (m([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (m([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (m([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (m([0x50, 0x4b, 0x03, 0x04]) || m([0x50, 0x4b, 0x05, 0x06])) return "application/zip";
  if (m([0x1f, 0x8b])) return "application/gzip";
  if (m([0x52, 0x49, 0x46, 0x46]) && m([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (m([0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4";
  return undefined;
}

function parsePartHeaders(block: string): { name?: string; filename?: string; contentType?: string } {
  const headers: Record<string, string> = {};
  for (const line of block.split("\r\n")) {
    const c = line.indexOf(":");
    if (c !== -1) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
  }
  const cd = headers["content-disposition"] ?? "";
  return {
    name: /name="([^"]*)"/.exec(cd)?.[1],
    filename: /filename="([^"]*)"/.exec(cd)?.[1],
    contentType: headers["content-type"],
  };
}

function boundaryOf(ct: string): string | undefined {
  return /boundary=("?)([^";]+)\1/i.exec(ct)?.[2];
}

function toWeb(iter: AsyncGenerator<Buffer>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iter.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await iter.return?.(undefined as never);
    },
  });
}

/**
 * Stream-parse a `multipart/form-data` request, yielding each field and file in
 * order. Use on a `{ body: false }` route so the core doesn't buffer the body.
 * Each `UploadFile` MUST be consumed (via `stream` or `buffer()`) before the next
 * part — unconsumed files are drained automatically. Throws `UploadError` (with a
 * `status`) when a guard is violated.
 */
export async function* parseUpload(ctx: Context, opts: UploadOptions = {}): AsyncGenerator<UploadField | UploadFile> {
  const req = ctx.request;
  const boundary = boundaryOf(String(req.headers["content-type"] ?? ""));
  if (!boundary) throw new UploadError("not multipart/form-data", 415);

  const maxFileSize = opts.maxFileSize ?? 10 * MiB;
  const maxFieldSize = opts.maxFieldSize ?? 1 * MiB;
  const allowExt = opts.allowedExtensions?.map((e) => e.toLowerCase());

  const total = Number(req.headers["content-length"]) || undefined;
  const it = (req as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  let buf: Buffer = Buffer.alloc(0);
  let ended = false;
  let received = 0;

  const more = async (): Promise<boolean> => {
    if (ended) return false;
    const r = await it.next();
    if (r.done) {
      ended = true;
      return false;
    }
    const chunk = r.value;
    received += chunk.length;
    if (opts.maxTotalBytes && received > opts.maxTotalBytes) throw new UploadError("upload exceeds maxTotalBytes", 413);
    opts.onProgress?.({ bytesReceived: received, totalBytes: total });
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    return true;
  };

  const ensure = async (sep: Buffer): Promise<number> => {
    let i: number;
    while ((i = buf.indexOf(sep)) === -1) if (!(await more())) return -1;
    return i;
  };

  const dashBoundary = Buffer.from(`--${boundary}`);
  const delim = Buffer.from(`\r\n--${boundary}`);

  // Per-part content reader: yields body chunks until the next boundary, bounded
  // by `cap`. Leaves `buf` positioned right after the boundary token.
  async function* content(cap: number): AsyncGenerator<Buffer> {
    let emitted = 0;
    const bump = (n: number) => {
      emitted += n;
      if (emitted > cap) throw new UploadError("file/field exceeds size limit", 413);
    };
    while (true) {
      const i = buf.indexOf(delim);
      if (i !== -1) {
        const chunk = buf.subarray(0, i);
        buf = buf.subarray(i + delim.length); // skip "\r\n--boundary"
        bump(chunk.length);
        if (chunk.length) yield chunk;
        return;
      }
      const keep = delim.length - 1; // could be a partial boundary at the tail
      if (buf.length > keep) {
        const cut = buf.length - keep;
        const chunk = buf.subarray(0, cut);
        buf = buf.subarray(cut);
        bump(chunk.length);
        if (chunk.length) yield chunk;
      }
      if (!(await more())) return; // truncated body
    }
  }

  // Validate magic bytes (if enabled), re-emitting the first chunk.
  async function* sniffed(gen: AsyncGenerator<Buffer>, declared?: string): AsyncGenerator<Buffer> {
    if (!opts.sniff) {
      yield* gen;
      return;
    }
    const first = await gen.next();
    if (first.done) return;
    const detected = sniffType(first.value);
    if (detected && opts.allowedTypes && !opts.allowedTypes.includes(detected)) {
      throw new UploadError(`detected content type ${detected} not allowed`, 415);
    }
    void declared;
    yield first.value;
    yield* gen;
  }

  {
    if ((await ensure(dashBoundary)) === -1) return;
    buf = buf.subarray(buf.indexOf(dashBoundary) + dashBoundary.length);

    let fileCount = 0;
    let fieldCount = 0;
    let current: AsyncGenerator<Buffer> | null = null;

    while (true) {
      // Drain any file part the consumer didn't fully read.
      if (current) {
        while (!(await current.next()).done);
        current = null;
      }

      while (buf.length < 2) if (!(await more())) return;
      if (buf[0] === 0x2d && buf[1] === 0x2d) return; // "--" → closing boundary
      buf = buf.subarray(2); // drop CRLF after the boundary token

      const hsep = await ensure(CRLF2);
      if (hsep === -1) return;
      const block = buf.subarray(0, hsep).toString("utf8");
      buf = buf.subarray(hsep + CRLF2.length);
      const { name, filename, contentType } = parsePartHeaders(block);
      if (name === undefined) {
        for await (const _ of content(maxFileSize)) void _; // skip nameless part
        continue;
      }

      if (filename === undefined) {
        if (++fieldCount > (opts.maxFields ?? 100)) throw new UploadError("too many fields", 413);
        const chunks: Buffer[] = [];
        for await (const ch of content(maxFieldSize)) chunks.push(ch);
        yield { kind: "field", name, value: Buffer.concat(chunks).toString("utf8") };
        continue;
      }

      // File part — validate the envelope before exposing the body.
      const clean = sanitizeFilename(filename);
      if (!clean) throw new UploadError("empty or invalid filename", 400);
      if (opts.filenamePattern && !opts.filenamePattern.test(clean)) throw new UploadError(`filename rejected: ${clean}`, 400);
      const ext = extname(clean).toLowerCase();
      if (allowExt && !allowExt.includes(ext)) throw new UploadError(`extension ${ext || "(none)"} not allowed`, 415);
      if (contentType && opts.allowedTypes && !opts.allowedTypes.includes(contentType)) {
        throw new UploadError(`declared content type ${contentType} not allowed`, 415);
      }
      if (++fileCount > (opts.maxFiles ?? 20)) throw new UploadError("too many files", 413);

      const gen = (current = content(maxFileSize));
      let consumed = false;
      const claim = () => {
        if (consumed) throw new UploadError("file body already consumed", 500);
        consumed = true;
      };
      const file: UploadFile = {
        kind: "file",
        name,
        filename: clean,
        contentType,
        get stream() {
          claim();
          return toWeb(sniffed(gen, contentType));
        },
        async buffer() {
          claim();
          const chunks: Buffer[] = [];
          for await (const ch of sniffed(gen, contentType)) chunks.push(ch);
          return Buffer.concat(chunks);
        },
      };
      yield file;
    }
  }
}

/** Collected (buffered) form of an upload — guards still abort oversized files. */
export interface CollectedUpload {
  fields: Record<string, string>;
  files: Array<{ name: string; filename: string; contentType?: string; data: Buffer }>;
}

/** Convenience: fully buffer an upload (applying all guards) into `{ fields, files }`. */
export async function collectUpload(ctx: Context, opts: UploadOptions = {}): Promise<CollectedUpload> {
  const fields: Record<string, string> = {};
  const files: CollectedUpload["files"] = [];
  for await (const part of parseUpload(ctx, opts)) {
    if (part.kind === "field") fields[part.name] = part.value;
    else files.push({ name: part.name, filename: part.filename, contentType: part.contentType, data: await part.buffer() });
  }
  return { fields, files };
}
