# @youneed/server-plugin-queue

A **durable background job queue** for [`@youneed/server`](../server). Where
[`@youneed/server-plugin-jobs`](../server-plugin-jobs) *schedules* recurring work
(cron/interval), this queues *one-off* background jobs with **retries + backoff**,
a **dead-letter** state, **delayed** jobs and **concurrent** workers — persisted
to a [KV store](../server-plugin-store) so jobs survive a restart and a fleet
shares one backlog.

```ts
import { Application } from "@youneed/server";
import { createQueue, queue } from "@youneed/server-plugin-queue";
import { redisKV } from "@youneed/kv-redis"; // or omit for the in-process MemoryKV

const jobs = createQueue({
  store: redisKV({ url: process.env.REDIS_URL }), // durable + shared across instances
  concurrency: 5,
  maxAttempts: 3,
  backoff: (attempt) => 1000 * 2 ** (attempt - 1), // 1s, 2s, 4s …
}).register("email", async ({ to }: { to: string }) => {
  await sendEmail(to); // throw → retried, then dead-lettered after maxAttempts
});

const app = Application().plugin(queue(jobs)); // starts workers on listen, drains on shutdown
app.listen(3000);

// enqueue from anywhere
await jobs.add("email", { to: "ada@x.dev" });
await jobs.add("email", { to: "grace@x.dev" }, { delayMs: 60_000 }); // run in 1 min
```

## The queue

- **`createQueue(opts)` / `new Queue(opts)`** — `store` (default `MemoryKV`),
  `namespace`, `concurrency`, `pollMs`, `maxAttempts`, `backoff(attempt)`,
  `visibilitySec` (lease TTL for crash recovery), `keepCompletedSec`, `handlers`.
- **`.register(name, handler)`** — a handler per job name. Throwing retries the
  job (with backoff) until `maxAttempts`, then moves it to the **`failed`**
  (dead-letter) state.
- **`.add(name, payload, { delayMs, maxAttempts, id })`** — enqueue. A reused `id`
  is idempotent (overwrites).
- **`.list(state?)` / `.get(id)` / `.stats()`** — inspect the backlog.
- **`.retry(id)` / `.remove(id)`** — requeue a dead-lettered job / delete one.
- **`.start()` / `.stop()`** — poll-driven workers (the plugin calls these).
- **`.runPending()`** — drain every currently-due job to completion (tests,
  one-shot workers, shutdown).

Jobs move `waiting → active → completed`, or on failure back to `waiting`
(retry, `runAt` pushed out by `backoff`) until `failed`. Each attempt is leased
via an atomic KV `incr` + TTL, so a crashed worker's job is retried by another
after `visibilitySec` — and multiple instances never run the same job twice.

## The plugin

`queue(q, { basePath?, exposeDevtools?, inspectLimit? })` is a `ServerPlugin`:
starts the workers `onListen`, drains `onShutdown`, and mounts control routes
under `basePath` (default `/__queue`): `GET /jobs`, `GET /stats`,
`POST /enqueue`, `POST /retry`, `POST /remove`.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
queue gets a **Queue** panel (under Infra): a live jobs table with state/attempts/
errors and **enqueue / retry / remove** actions. Registered by importing
`@youneed/server-plugin-queue/devtools` into the devtools web bundle (already
wired there).

## Backends

- **`MemoryKV`** (built-in) — single instance / dev.
- **`RedisKV`** ([`@youneed/kv-redis`](../kv-redis)) — durable + shared across a
  fleet. Any [`KV`](../server-plugin-store) implementation works (it needs the
  optional `scan` to enumerate jobs).
