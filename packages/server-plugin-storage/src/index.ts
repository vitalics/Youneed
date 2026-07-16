// ── @youneed/server-plugin-storage — pluggable object storage ────────────────
//
// A blob / object store: put/get/delete/list bytes under string keys. The
// framework never *hosts* the bytes — it defines the `StorageAdapter` contract
// here and WHERE the objects physically live is chosen on deployment by which
// adapter you plug in:
//
//   • MemoryStorage (built-in)          → in this process. Single instance / dev.
//   • FileStorage(root) (built-in)      → the local filesystem under `root`.
//   • s3Storage({ bucket, … })          → Amazon S3 / any S3-compatible endpoint
//                                          (lazy-imports @aws-sdk/client-s3).
//
// `storage(adapter)` is a ServerPlugin: it exposes control routes and — with
// `@youneed/server-plugin-devtools` mounted — surfaces a Storage tab (object
// browser: list / download / delete / put-text).

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";

/** One entry returned by {@link StorageAdapter.list}. */
export interface StorageEntry {
  key: string;
  /** Size of the stored object in bytes. */
  size: number;
  contentType?: string;
  /** Epoch ms the object was last written. */
  updatedAt: number;
}

/** Options for {@link StorageAdapter.put}. */
export interface PutOptions {
  contentType?: string;
}

/**
 * A pluggable object / blob store. Values are raw bytes stored under string
 * keys; callers serialize (text → bytes) as needed. Every op is async — an
 * adapter may do network or disk I/O.
 */
export interface StorageAdapter {
  /** A short backend identifier (e.g. `"memory"`, `"file"`, `"s3"`). */
  readonly name: string;
  /** Store bytes under `key` (overwrites). */
  put(key: string, data: Uint8Array | Buffer | string, opts?: PutOptions): Promise<void>;
  /** Load the bytes at `key`, or `null` if it does not exist. */
  get(key: string): Promise<{ data: Uint8Array; contentType?: string } | null>;
  /** Delete `key` (no-op if missing). */
  delete(key: string): Promise<void>;
  /** Whether `key` exists. */
  exists(key: string): Promise<boolean>;
  /** List entries, optionally filtered to those whose key starts with `prefix`. */
  list(prefix?: string): Promise<StorageEntry[]>;
  /** A stable URL for `key`, when the backend can serve one directly (e.g. S3). */
  url?(key: string): string;
}

// ── shared helpers ──────────────────────────────────────────────────────────

/** Coerce the accepted `put` inputs to a `Uint8Array`. */
function toBytes(data: Uint8Array | Buffer | string): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

/** Reject keys that could escape their storage root (path traversal / absolute). */
function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || key.startsWith("/") || key.startsWith("\\") || /^[a-zA-Z]:/.test(key)) {
    throw new Error(`unsafe storage key: ${JSON.stringify(key)}`);
  }
}

// ── MemoryStorage (built-in) ──────────────────────────────────────────────────

interface MemObject {
  data: Uint8Array;
  contentType?: string;
  updatedAt: number;
}

/** In-process object store backed by a `Map`. The default — correct for a
 *  single instance, NOT shared across processes. */
export class MemoryStorage implements StorageAdapter {
  readonly name = "memory";
  #map = new Map<string, MemObject>();
  #now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.#now = opts.now ?? (() => Date.now());
  }

  async put(key: string, data: Uint8Array | Buffer | string, opts: PutOptions = {}): Promise<void> {
    assertSafeKey(key);
    this.#map.set(key, { data: toBytes(data), contentType: opts.contentType, updatedAt: this.#now() });
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType?: string } | null> {
    assertSafeKey(key);
    const o = this.#map.get(key);
    return o ? { data: o.data, contentType: o.contentType } : null;
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    this.#map.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return this.#map.has(key);
  }

  async list(prefix?: string): Promise<StorageEntry[]> {
    const out: StorageEntry[] = [];
    for (const [key, o] of this.#map) {
      if (prefix && !key.startsWith(prefix)) continue;
      out.push({ key, size: o.data.byteLength, contentType: o.contentType, updatedAt: o.updatedAt });
    }
    out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out;
  }

  /** Entries currently held. */
  get size(): number {
    return this.#map.size;
  }
}

// ── FileStorage (built-in) ────────────────────────────────────────────────────

/** Object store on the local filesystem under `root`. Each object is a file at
 *  `root/<key>` with a sibling `root/<key>.meta` JSON holding its contentType +
 *  updatedAt. Keys are validated against path traversal before touching disk. */
export class FileStorage implements StorageAdapter {
  readonly name = "file";
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  #paths(key: string): { file: string; meta: string } {
    assertSafeKey(key);
    // Lazy require kept local so the module has no top-level node:path cost either.
    // (path/fs are imported dynamically in each op below.)
    return { file: key, meta: `${key}.meta` };
  }

  async put(key: string, data: Uint8Array | Buffer | string, opts: PutOptions = {}): Promise<void> {
    const { join, dirname } = await import("node:path");
    const fs = await import("node:fs/promises");
    const rel = this.#paths(key);
    const file = join(this.#root, rel.file);
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, toBytes(data));
    const meta = { contentType: opts.contentType, updatedAt: Date.now() };
    await fs.writeFile(join(this.#root, rel.meta), JSON.stringify(meta));
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType?: string } | null> {
    const { join } = await import("node:path");
    const fs = await import("node:fs/promises");
    const rel = this.#paths(key);
    try {
      const buf = await fs.readFile(join(this.#root, rel.file));
      let contentType: string | undefined;
      try {
        const raw = await fs.readFile(join(this.#root, rel.meta), "utf8");
        contentType = (JSON.parse(raw) as { contentType?: string }).contentType;
      } catch {
        /* no sidecar — that's fine */
      }
      return { data: new Uint8Array(buf), contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const { join } = await import("node:path");
    const fs = await import("node:fs/promises");
    const rel = this.#paths(key);
    await fs.rm(join(this.#root, rel.file), { force: true });
    await fs.rm(join(this.#root, rel.meta), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const { join } = await import("node:path");
    const fs = await import("node:fs/promises");
    const rel = this.#paths(key);
    try {
      await fs.access(join(this.#root, rel.file));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix?: string): Promise<StorageEntry[]> {
    const { join, relative, sep } = await import("node:path");
    const fs = await import("node:fs/promises");
    const out: StorageEntry[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const abs = join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(abs);
          continue;
        }
        if (ent.name.endsWith(".meta")) continue;
        const key = relative(this.#root, abs).split(sep).join("/");
        if (prefix && !key.startsWith(prefix)) continue;
        let size = 0;
        try {
          size = (await fs.stat(abs)).size;
        } catch {
          continue;
        }
        let contentType: string | undefined;
        let updatedAt = Date.now();
        try {
          const raw = await fs.readFile(`${abs}.meta`, "utf8");
          const meta = JSON.parse(raw) as { contentType?: string; updatedAt?: number };
          contentType = meta.contentType;
          if (typeof meta.updatedAt === "number") updatedAt = meta.updatedAt;
        } catch {
          /* no sidecar */
        }
        out.push({ key, size, contentType, updatedAt });
      }
    };

    await walk(this.#root);
    out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out;
  }
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

export interface StoragePluginOptions {
  /** Internal route prefix (default `"/__storage"`). */
  basePath?: string;
  /** Mount the devtools introspection + control routes (default true). */
  exposeDevtools?: boolean;
}

/** The `inspect()` payload — devtools detects the store by `kind === "storage"`. */
export interface StorageInspect {
  kind: "storage";
  backend: string;
  endpoints: { list: string; object: string; put: string; delete: string };
}

/**
 * Mount a {@link StorageAdapter} as a ServerPlugin: exposes control routes and
 * an `inspect()` for the devtools Storage tab (object browser).
 */
export function storage(adapter: StorageAdapter, opts: StoragePluginOptions = {}): ServerPlugin & { adapter: StorageAdapter } {
  const basePath = (opts.basePath ?? "/__storage").replace(/\/$/, "");
  const endpoints = {
    list: `${basePath}/list`,
    object: `${basePath}/object`,
    put: `${basePath}/put`,
    delete: `${basePath}/delete`,
  };

  return {
    name: "storage",
    adapter,
    setup(app) {
      if (opts.exposeDevtools === false) return;

      app.get(endpoints.list, async (ctx: Context) => {
        const prefix = ctx.query?.prefix || undefined;
        const entries = await adapter.list(prefix);
        return Response.json({ entries });
      });

      app.get(endpoints.object, async (ctx: Context) => {
        const key = ctx.query?.key;
        if (!key) return Response.json({ error: "key is required" }, { status: 400 });
        let obj: { data: Uint8Array; contentType?: string } | null;
        try {
          obj = await adapter.get(key);
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
        }
        if (!obj) return Response.json({ found: false });
        return Response({
          headers: { "Content-Type": obj.contentType ?? "application/octet-stream" },
          body: Buffer.from(obj.data),
        });
      });

      app.post(endpoints.put, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { key?: string; text?: string; contentType?: string };
        if (!body.key) return Response.json({ error: "key is required" }, { status: 400 });
        try {
          await adapter.put(body.key, body.text ?? "", { contentType: body.contentType ?? "text/plain" });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
        }
        return Response.json({ ok: true });
      });

      app.post(endpoints.delete, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { key?: string };
        if (!body.key) return Response.json({ error: "key is required" }, { status: 400 });
        try {
          await adapter.delete(body.key);
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
        }
        return Response.json({ ok: true });
      });
    },
    inspect(): StorageInspect {
      // `inspect()` is sync (topology never awaits it) and the objects live in a
      // (possibly remote) backend — so this returns backend + endpoints and the
      // devtools panel fetches the live listing over the routes above.
      return { kind: "storage", backend: adapter.name, endpoints };
    },
  };
}

/** Convenience: mount a plugin, defaulting to an in-process {@link MemoryStorage}. */
export function createStorage(adapter?: StorageAdapter, opts?: StoragePluginOptions): ServerPlugin & { adapter: StorageAdapter } {
  return storage(adapter ?? new MemoryStorage(), opts);
}

export { s3Storage, type S3StorageOptions } from "./s3.ts";
