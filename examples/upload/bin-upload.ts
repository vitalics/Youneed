// Upload demo: partial (chunked) file upload via Content-Range + positioned
// disk writes, plus multipart/form-data parsing. Self-contained & self-checking.
// Run: pnpm upload   (or: tsx examples/upload/bin-upload.ts)
import { Application, Response, File } from "@youneed/server";
import { bodyLimit } from "@youneed/server-middleware-body-limit";
import type { AppBuilder, HTTP, MultipartBody } from "@youneed/server";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 41021;
const base = `http://127.0.0.1:${PORT}`;
const DIR = mkdtempSync(join(tmpdir(), "upload-demo-"));

// Track each upload's progress; the file is written with positioned writes so
// chunks could even arrive out of order (resumable-style).
interface Upload {
  total: number;
  received: number;
  path: string;
}
const uploads = new Map<string, Upload>();

function parseContentRange(header: string | undefined): { start: number; total: number } {
  // "bytes 0-16383/40960"
  const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(header ?? "");
  if (!m) throw new Error("missing/invalid Content-Range");
  return { start: Number(m[1]), total: Number(m[3]) };
}

const app = Application()
  // Each chunk is bounded; cap it so a single PUT can't blow memory.
  .use("/upload", bodyLimit("1mb"))
  .put("/upload/:id", async (ctx) => {
    const id = ctx.params.id;
    const { start, total } = parseContentRange(ctx.request.headers["content-range"] as string);
    const chunk = ctx.body as Buffer; // binary content-type → Buffer

    let u = uploads.get(id);
    if (!u) {
      u = { total, received: 0, path: join(DIR, id) };
      await writeFile(u.path, Buffer.alloc(0)); // create the target
      uploads.set(id, u);
    }
    const fh = await open(u.path, "r+");
    await fh.write(chunk, 0, chunk.length, start); // write at the right offset
    await fh.close();
    u.received += chunk.length;

    const complete = u.received >= u.total;
    return Response.json({ id, received: u.received, total: u.total, complete }, { status: 201 });
  })
  .get("/upload/:id", (ctx) => {
    const u = uploads.get(ctx.params.id);
    if (!u) return Response.json({ error: "unknown upload" }, { status: 404 });
    if (u.received < u.total) {
      return Response.json({ received: u.received, total: u.total, complete: false });
    }
    return File(u.path); // assembled file, streamed back
  })
  // multipart/form-data: parsed into { fields, files } automatically.
  .post("/form", (ctx) => {
    const mp = ctx.body as MultipartBody;
    return Response.json({
      fields: mp.fields,
      files: mp.files.map((f) => ({ filename: f.filename, type: f.contentType, size: f.data.length })),
    });
  });

function listen(a: AppBuilder, port: number): Promise<HTTP> {
  return new Promise((resolve) => {
    const h = a.listen(port, () => resolve(h));
  });
}

async function main() {
  const server = await listen(app, PORT);
  try {
    // A deterministic 40 KB payload (byte i = i mod 256) — easy to verify and
    // big enough to actually split into several chunks.
    const payload = Buffer.alloc(40_000);
    for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;
    const id = "demo.bin";
    const CHUNK = 16 * 1024;
    const nChunks = Math.ceil(payload.length / CHUNK);

    console.log(`① chunked upload — ${payload.length} bytes in ${nChunks} chunks of ${CHUNK}:`);
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.subarray(i, Math.min(i + CHUNK, payload.length));
      const res = await fetch(`${base}/upload/${id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          "content-range": `bytes ${i}-${i + chunk.length - 1}/${payload.length}`,
        },
        body: chunk,
      });
      const body = (await res.json()) as { received: number; total: number; complete: boolean };
      console.log(`   chunk @${i}: ${body.received}/${body.total}${body.complete ? "  ✓ complete" : ""}`);
      assert.equal(res.status, 201);
    }

    console.log("② download the assembled file and verify it byte-for-byte:");
    const dl = await fetch(`${base}/upload/${id}`);
    const got = Buffer.from(await dl.arrayBuffer());
    console.log(`   downloaded ${got.length} bytes; matches original: ${got.equals(payload)}`);
    assert.equal(got.length, payload.length, "size matches");
    assert.ok(got.equals(payload), "content matches byte-for-byte");

    console.log("③ multipart/form-data upload (field + file):");
    const fd = new FormData();
    fd.set("title", "release notes");
    fd.set("doc", new Blob([Buffer.from("hello multipart\n")], { type: "text/plain" }), "notes.txt");
    const mp = await fetch(`${base}/form`, { method: "POST", body: fd });
    const parsed = (await mp.json()) as {
      fields: Record<string, string>;
      files: { filename: string; type: string; size: number }[];
    };
    console.log(`   fields: ${JSON.stringify(parsed.fields)}`);
    console.log(`   files : ${JSON.stringify(parsed.files)}`);
    assert.equal(parsed.fields.title, "release notes");
    assert.equal(parsed.files[0].filename, "notes.txt");
    assert.equal(parsed.files[0].size, 16);

    console.log("\n✓ chunked upload + multipart parsing behaved as expected");
  } finally {
    await server[Symbol.asyncDispose]();
    rmSync(DIR, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
