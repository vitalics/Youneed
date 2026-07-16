// Run: pnpm --filter @youneed/server-upload test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP, Context } from "@youneed/server";
import { parseUpload, collectUpload, sanitizeFilename, UploadError } from "../src/index.ts";

const BOUNDARY = "----youneedtest9000";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 5, 6, 7, 8]);

interface Part { name: string; filename?: string; contentType?: string; data: Buffer | string }
function buildMultipart(parts: Part[]): Buffer {
  const segs: Buffer[] = [];
  for (const p of parts) {
    let head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename !== undefined) head += `; filename="${p.filename}"`;
    head += "\r\n";
    if (p.contentType) head += `Content-Type: ${p.contentType}\r\n`;
    head += "\r\n";
    segs.push(Buffer.concat([Buffer.from(head), Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data), Buffer.from("\r\n")]));
  }
  segs.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(segs);
}

// Map UploadError → an HTTP response (what a real handler does).
const guarded =
  (fn: (ctx: Context) => Promise<unknown>) =>
  async (ctx: Context) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }
  };

class UploadSuite extends Test({ name: "server-upload" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41380";

  @Test.beforeAll() async start() {
    const app = Application()
      .post(
        "/collect",
        guarded(async (ctx) => {
          const { fields, files } = await collectUpload(ctx, { sniff: false });
          return Response.json({
            fields,
            files: files.map((f) => ({ name: f.name, filename: f.filename, type: f.contentType, size: f.data.length })),
          });
        }),
        { body: false },
      )
      .post(
        "/stream",
        guarded(async (ctx) => {
          let bytes = 0;
          let filename = "";
          for await (const part of parseUpload(ctx, {})) {
            if (part.kind === "file") {
              filename = part.filename;
              const reader = part.stream.getReader();
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.length;
              }
            }
          }
          return Response.json({ filename, bytes });
        }),
        { body: false },
      )
      .post(
        "/progress",
        guarded(async (ctx) => {
          let received = 0;
          await collectUpload(ctx, { onProgress: (p) => (received = p.bytesReceived) });
          return Response.json({ received });
        }),
        { body: false },
      )
      .post("/maxsize", guarded((ctx) => collectUpload(ctx, { maxFileSize: 10 }).then(() => Response.json({ ok: true }))), { body: false })
      .post("/ext", guarded((ctx) => collectUpload(ctx, { allowedExtensions: [".png"] }).then(() => Response.json({ ok: true }))), { body: false })
      .post("/sniff", guarded((ctx) => collectUpload(ctx, { sniff: true, allowedTypes: ["image/png"] }).then(() => Response.json({ ok: true }))), { body: false });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41380, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  #post(path: string, body: Buffer) {
    return fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      body,
    });
  }

  @Test.it("collect: fields + file parsed with metadata") async collect() {
    const body = buildMultipart([
      { name: "title", data: "hello" },
      { name: "avatar", filename: "pic.png", contentType: "image/png", data: PNG },
    ]);
    const r = await this.#post("/collect", body);
    const b = (await r.json()) as { fields: Record<string, string>; files: { filename: string; type: string; size: number }[] };
    expect(b.fields.title === "hello" && b.files[0].filename === "pic.png" && b.files[0].type === "image/png" && b.files[0].size === PNG.length).toBeTruthy();
  }

  @Test.it("stream: file consumed via web ReadableStream") async stream() {
    const body = buildMultipart([{ name: "f", filename: "a.bin", contentType: "application/octet-stream", data: Buffer.alloc(5000, 7) }]);
    const r = await this.#post("/stream", body);
    const b = (await r.json()) as { filename: string; bytes: number };
    expect(b.filename === "a.bin" && b.bytes === 5000).toBeTruthy();
  }

  @Test.it("progress: bytesReceived totals the body size") async progress() {
    const body = buildMultipart([{ name: "f", filename: "a.bin", contentType: "application/octet-stream", data: Buffer.alloc(2048, 1) }]);
    const r = await this.#post("/progress", body);
    const b = (await r.json()) as { received: number };
    expect(b.received === body.length).toBeTruthy();
  }

  @Test.it("guard: oversized file → 413") async maxSize() {
    const body = buildMultipart([{ name: "f", filename: "big.bin", data: Buffer.alloc(100, 9) }]);
    const r = await this.#post("/maxsize", body);
    await r.body?.cancel();
    expect(r.status).toBe(413);
  }

  @Test.it("guard: disallowed extension → 415") async ext() {
    const body = buildMultipart([{ name: "f", filename: "evil.exe", data: PNG }]);
    const r = await this.#post("/ext", body);
    await r.body?.cancel();
    expect(r.status).toBe(415);
  }

  @Test.it("guard: content sniff catches a zip disguised as .png → 415") async sniff() {
    const body = buildMultipart([{ name: "f", filename: "fake.png", contentType: "image/png", data: ZIP }]);
    const r = await this.#post("/sniff", body);
    await r.body?.cancel();
    expect(r.status).toBe(415);
  }

  @Test.it("sanitizeFilename strips path traversal") sanitize() {
    expect(sanitizeFilename("../../etc/passwd") === "passwd" && sanitizeFilename("a\\b\\c.txt") === "c.txt").toBeTruthy();
  }
}

await TestApplication().addTests(UploadSuite).reporter(new ConsoleReporter()).run();
