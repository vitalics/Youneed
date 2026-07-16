# Background services — mailer, storage, queue

Three plugins for work off the request path: sending email, storing bytes, and running durable
background jobs. Mailer and storage are one **contract + swappable adapter**; the queue
persists to a KV store.

## Transactional email — `@youneed/server-plugin-mailer`

Backend-agnostic `MailTransport` = `{ name, send(msg): Promise<MailResult> }`. Pick a transport
per provider; the plugin tracks recent sends and (with devtools) shows a Mailer tab.

```ts
import { Application } from "@youneed/server";
import { mailer } from "@youneed/server-plugin-mailer";
import { smtpTransport } from "@youneed/server-plugin-mailer/smtp";

const mail = mailer(smtpTransport({ host: "smtp.acme.dev", port: 587, auth: { user, pass }, from: "no-reply@acme.dev" }));
Application().plugin(mail).listen(3000);

await mail.transport.send({ to: "ada@x.dev", subject: "Welcome", text: "Hello!", html: "<b>Hello!</b>" });
//     ^ use the plugin's tracked transport so devtools sees the send
```

| Transport | Import | Backend |
|-----------|--------|---------|
| `smtpTransport(opts)` | `.../smtp` | any SMTP (TLS/STARTTLS/AUTH LOGIN), built-in, no deps |
| `sesTransport(opts)` | `.../ses` | AWS SES v2 `SendEmail`, SigV4 (`node:crypto`), no aws-sdk |
| `sendgridTransport(opts)` | `.../sendgrid` | SendGrid v3 `POST /v3/mail/send` (Bearer key) |
| `postmarkTransport(opts)` | `.../postmark` | Postmark `POST /email` (`X-Postmark-Server-Token`) |

All implement `MailTransport` → write your own too. Transports live in subpath imports
(`@youneed/server-plugin-mailer/{smtp,ses,sendgrid,postmark}`).

## Object / blob storage — `@youneed/server-plugin-storage`

One `StorageAdapter` contract; choose where bytes physically live at deploy time without
touching call sites.

```ts
import { Application } from "@youneed/server";
import { storage, FileStorage, s3Storage, MemoryStorage } from "@youneed/server-plugin-storage";

const files = new FileStorage("./data");                         // local disk
// const files = s3Storage({ bucket: "my-bucket", region: "us-east-1" }); // S3
// const files = new MemoryStorage();                            // dev / single instance

Application().plugin(storage(files)).listen(3000);

await files.put("docs/readme.txt", "hello", { contentType: "text/plain" });
const obj = await files.get("docs/readme.txt");   // { data: Uint8Array, contentType } | null
await files.list("docs/");                         // [{ key, size, contentType?, updatedAt }]
await files.delete("docs/readme.txt");
```
**Contract:** `name`, `put(key,data,{contentType?})` (`data`: Uint8Array|Buffer|string),
`get(key)`, `delete(key)`, `exists(key)`, `list(prefix?)`, optional `url?(key)` (S3 direct
URL). Keys are validated against path traversal (`..`/absolute rejected).

| Adapter | Where | Notes |
|---------|-------|-------|
| `MemoryStorage` | this process (`Map`) | dev / single instance; not shared |
| `FileStorage(root)` | local FS under `root` | bytes + sidecar `<key>.meta` JSON for contentType |
| `s3Storage({ bucket, region, prefix?, endpoint?, credentials? })` | S3 / S3-compatible | lazily imports optional `@aws-sdk/client-s3`; `endpoint` for MinIO/R2 |

## Durable job queue — `@youneed/server-plugin-queue`

One-off background jobs with retries+backoff, dead-letter, delayed + concurrent workers,
persisted to a KV store so jobs survive restart and a fleet shares one backlog. (Contrast
`@youneed/server-plugin-jobs` = *recurring* cron/interval scheduling.)

```ts
import { Application } from "@youneed/server";
import { createQueue, queue } from "@youneed/server-plugin-queue";
import { redisKV } from "@youneed/kv-redis";                    // or omit → in-process MemoryKV

const jobs = createQueue({
  store: redisKV({ url: process.env.REDIS_URL }),               // durable + shared
  concurrency: 5, maxAttempts: 3,
  backoff: (attempt) => 1000 * 2 ** (attempt - 1),              // 1s, 2s, 4s …
}).register("email", async ({ to }: { to: string }) => { await sendEmail(to); });  // throw → retried, then dead-lettered

Application().plugin(queue(jobs)).listen(3000);                 // workers start on listen, drain on shutdown

await jobs.add("email", { to: "ada@x.dev" });
await jobs.add("email", { to: "grace@x.dev" }, { delayMs: 60_000 });   // run in 1 min
```
- **`createQueue(opts)`** — `store` (default `MemoryKV`), `namespace`, `concurrency`, `pollMs`,
  `maxAttempts`, `backoff(attempt)`, `visibilitySec` (lease TTL for crash recovery),
  `keepCompletedSec`, `handlers`.
- **`.register(name, handler)`** — throwing retries with backoff until `maxAttempts`, then the
  job moves to the **`failed`** (dead-letter) state.
- **`.add(name, payload, { delayMs, maxAttempts, id })`** — a reused `id` is idempotent.
- **`.list(state?)` / `.get(id)` / `.stats()`** — inspect. **`.retry(id)` / `.remove(id)`** —
  requeue a dead-lettered job / delete. **`.runPending()`** — drain due jobs (tests/one-shot).

Jobs move `waiting → active → completed`, or on failure back to `waiting` until dead-lettered.
