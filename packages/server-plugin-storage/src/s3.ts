// ── @youneed/server-plugin-storage/s3 — the S3 adapter ───────────────────────
//
// Implements the `StorageAdapter` contract against Amazon S3 (or any
// S3-compatible endpoint: MinIO, R2, Backblaze B2, …). `@aws-sdk/client-s3` is
// an OPTIONAL dependency and is imported *lazily* — the first call constructs
// the client — so an app that never touches S3 pays nothing for it.

import type { PutOptions, StorageAdapter, StorageEntry } from "./index.ts";

export interface S3StorageOptions {
  bucket: string;
  region: string;
  /** Optional key prefix applied to every object (a "folder"). */
  prefix?: string;
  /** Custom endpoint for S3-compatible services (MinIO, R2, …). */
  endpoint?: string;
  /** Static credentials. Omit to use the SDK's default credential chain. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/** Concatenate raw byte chunks from an S3 body stream into one `Uint8Array`. */
async function collect(body: unknown): Promise<Uint8Array> {
  // `transformToByteArray` is provided by the SDK's stream mixin in Node + browser.
  const b = body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (b?.transformToByteArray) return b.transformToByteArray();
  // Fallback: async-iterable of Buffers/Uint8Arrays.
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * An {@link StorageAdapter} backed by Amazon S3 (or a compatible endpoint).
 * Lazily imports `@aws-sdk/client-s3` on first use.
 */
export function s3Storage(opts: S3StorageOptions): StorageAdapter {
  const prefix = opts.prefix ? opts.prefix.replace(/\/$/, "") + "/" : "";
  const full = (key: string): string => prefix + key;

  // Cache the (async-constructed) client + command classes.
  let clientP: Promise<{
    client: any;
    PutObjectCommand: any;
    GetObjectCommand: any;
    DeleteObjectCommand: any;
    HeadObjectCommand: any;
    ListObjectsV2Command: any;
  }> | null = null;

  const sdk = () => {
    clientP ??= (async () => {
      // Computed specifier + cast: `@aws-sdk/client-s3` is an OPTIONAL dependency,
      // so it is imported lazily and typed structurally (the package may not be
      // installed at build time in apps that never use S3).
      const specifier = "@aws-sdk/client-s3";
      const s3 = (await import(/* @vite-ignore */ specifier)) as unknown as {
        S3Client: new (cfg: unknown) => any;
        PutObjectCommand: any;
        GetObjectCommand: any;
        DeleteObjectCommand: any;
        HeadObjectCommand: any;
        ListObjectsV2Command: any;
      };
      const client = new s3.S3Client({
        region: opts.region,
        endpoint: opts.endpoint,
        forcePathStyle: opts.endpoint ? true : undefined,
        credentials: opts.credentials,
      });
      return {
        client,
        PutObjectCommand: s3.PutObjectCommand,
        GetObjectCommand: s3.GetObjectCommand,
        DeleteObjectCommand: s3.DeleteObjectCommand,
        HeadObjectCommand: s3.HeadObjectCommand,
        ListObjectsV2Command: s3.ListObjectsV2Command,
      };
    })();
    return clientP;
  };

  return {
    name: "s3",

    async put(key: string, data: Uint8Array | Buffer | string, putOpts: PutOptions = {}): Promise<void> {
      const { client, PutObjectCommand } = await sdk();
      const Body = typeof data === "string" ? new TextEncoder().encode(data) : data;
      await client.send(new PutObjectCommand({ Bucket: opts.bucket, Key: full(key), Body, ContentType: putOpts.contentType }));
    },

    async get(key: string): Promise<{ data: Uint8Array; contentType?: string } | null> {
      const { client, GetObjectCommand } = await sdk();
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: full(key) }));
        return { data: await collect(res.Body), contentType: res.ContentType };
      } catch (err) {
        if ((err as { name?: string })?.name === "NoSuchKey" || (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },

    async delete(key: string): Promise<void> {
      const { client, DeleteObjectCommand } = await sdk();
      await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: full(key) }));
    },

    async exists(key: string): Promise<boolean> {
      const { client, HeadObjectCommand } = await sdk();
      try {
        await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: full(key) }));
        return true;
      } catch (err) {
        if ((err as { name?: string })?.name === "NotFound" || (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    },

    async list(listPrefix?: string): Promise<StorageEntry[]> {
      const { client, ListObjectsV2Command } = await sdk();
      const out: StorageEntry[] = [];
      let token: string | undefined;
      do {
        const res = await client.send(
          new ListObjectsV2Command({ Bucket: opts.bucket, Prefix: prefix + (listPrefix ?? ""), ContinuationToken: token }),
        );
        for (const obj of res.Contents ?? []) {
          const rawKey: string = obj.Key ?? "";
          const key = rawKey.startsWith(prefix) ? rawKey.slice(prefix.length) : rawKey;
          out.push({ key, size: obj.Size ?? 0, updatedAt: obj.LastModified ? new Date(obj.LastModified).getTime() : Date.now() });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return out;
    },

    url(key: string): string {
      if (opts.endpoint) return `${opts.endpoint.replace(/\/$/, "")}/${opts.bucket}/${full(key)}`;
      return `https://${opts.bucket}.s3.${opts.region}.amazonaws.com/${full(key)}`;
    },
  };
}
