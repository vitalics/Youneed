# @youneed/server-plugin-storage

**Pluggable object / blob storage** for [`@youneed/server`](../server). Put, get,
delete and list raw bytes under string keys behind one `StorageAdapter` contract —
and choose *where* the bytes physically live on deployment by which adapter you
plug in (in-process, the local filesystem, or S3), without touching call sites.

```ts
import { Application } from "@youneed/server";
import { storage, FileStorage, s3Storage, MemoryStorage } from "@youneed/server-plugin-storage";

// pick a backend
const files = new FileStorage("./data");                     // local disk
// const files = s3Storage({ bucket: "my-bucket", region: "us-east-1" }); // S3
// const files = new MemoryStorage();                        // dev / single instance

const app = Application().plugin(storage(files)); // exposes control routes + devtools tab
app.listen(3000);

// use it from anywhere
await files.put("docs/readme.txt", "hello", { contentType: "text/plain" });
const obj = await files.get("docs/readme.txt"); // { data: Uint8Array, contentType }
await files.list("docs/");                       // [{ key, size, contentType, updatedAt }]
await files.delete("docs/readme.txt");
```

## The contract

Every adapter implements `StorageAdapter`:

- **`readonly name`** — a short backend id (`"memory"`, `"file"`, `"s3"`).
- **`put(key, data, { contentType? })`** — `data` is `Uint8Array | Buffer | string`.
- **`get(key)`** → `{ data: Uint8Array, contentType? } | null`.
- **`delete(key)`** / **`exists(key)`**.
- **`list(prefix?)`** → `StorageEntry[]` where `StorageEntry = { key, size, contentType?, updatedAt }`.
- **`url?(key)`** — a direct URL, when the backend can serve one (S3).

Keys are validated against path traversal (`..`, absolute paths are rejected).

## Adapters

| Adapter | Import | Where it lives | Notes |
| --- | --- | --- | --- |
| `MemoryStorage` | built-in | this process (`Map`) | dev / single instance; not shared |
| `FileStorage(root)` | built-in | local filesystem under `root` | bytes + a sidecar `<key>.meta` JSON for contentType |
| `s3Storage({ bucket, region, prefix?, endpoint?, credentials? })` | built-in | Amazon S3 / S3-compatible | lazily imports the optional `@aws-sdk/client-s3`; `url()` returns the object URL; `endpoint` for MinIO/R2/… |

`s3Storage` only loads `@aws-sdk/client-s3` (an **optional** dependency) the first
time it is used — an app that never touches S3 pays nothing for it.

## The plugin

`storage(adapter, { basePath?, exposeDevtools? })` is a `ServerPlugin`. It mounts
control routes under `basePath` (default `/__storage`):

- `GET /list?prefix=` → `{ entries }`
- `GET /object?key=` → the raw bytes (with the stored `content-type`), or `{ found: false }`
- `POST /put` `{ key, text, contentType? }` — store `text` (kept simple for the devtools editor)
- `POST /delete` `{ key }`

`inspect()` returns `{ kind: "storage", backend, endpoints }`. `createStorage(adapter?)`
is a convenience that defaults to an in-process `MemoryStorage`.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
store gets a **Storage** panel (under Infra): an **object browser** — list entries
(key / size / type / updated) with **Download** and **Delete**, a **prefix filter**,
and a small **put text object** form. Registered by importing
`@youneed/server-plugin-storage/devtools` into the devtools web bundle (already
wired there).
