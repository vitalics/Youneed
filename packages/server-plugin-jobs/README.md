# @youneed/server-plugin-jobs

A zero-dependency **job scheduler**: run work on a cron expression, a fixed
interval, or a one-off delay/instant. Distinct from the DOM microtask scheduler —
this fires *clock-time* jobs. Ships both a standalone `Scheduler` and a
[`@youneed/server`](../server) plugin that binds the scheduler to the server
lifecycle.

Everything is **deterministic**: the package never calls `Date.now()` or
`setTimeout` directly. Those live only behind injectable defaults, so a fake clock
+ timer registry makes tests run instantly.

## Server plugin

Use the `jobs()` plugin to bind a scheduler to the server lifecycle: it
`start()`s once the server is listening (`onListen`) and `stop()`s during
graceful drain (`onShutdown`). The owned scheduler is exposed as `.scheduler`,
so you can keep adding/triggering jobs after registration.

```ts
import { Application } from "@youneed/server";
import { jobs } from "@youneed/server-plugin-jobs";

const cron = jobs({ jobs: [{ name: "cleanup", schedule: "0 */6 * * *", handler: purge }] });
app.plugin(cron).listen(3000, () => {}); // scheduler.start() on listen, stop() on drain

// still mutable after registration
cron.scheduler.add({ name: "heartbeat", schedule: { every: 30_000 }, handler: ping });
```

`JobsPluginOptions` is every `SchedulerOptions` knob (`now`, `setTimer`,
`clearTimer`, `onError`, `store`, `lockTtl`) plus an optional `jobs?: Job[]` to
register up front.

## Standalone scheduler

```ts
import { createScheduler } from "@youneed/server-plugin-jobs";

const scheduler = createScheduler({
  onError: (err, job) => console.error(`job ${job.name} failed`, err),
});

scheduler
  .add({ name: "report", schedule: "0 */6 * * *", handler: () => buildReport() })
  .add({ name: "heartbeat", schedule: { every: 30_000 }, handler: () => ping() })
  .add({ name: "warmup", schedule: { after: 5_000 }, handler: () => warm(), runOnStart: true })
  .start();

// later …
scheduler.stop();
```

## Cron syntax

Standard **5-field** cron — `minute hour day-of-month month day-of-week` — or
**6-field** with a leading seconds field:

```
┌──────────── second (0–59)        (only in 6-field form)
│ ┌────────── minute (0–59)
│ │ ┌──────── hour (0–23)
│ │ │ ┌────── day-of-month (1–31)
│ │ │ │ ┌──── month (1–12 or JAN–DEC)
│ │ │ │ │ ┌── day-of-week (0–7 or SUN–SAT; 0 and 7 = Sunday)
* * * * * *
```

Each field supports:

| Form        | Example      | Meaning                          |
| ----------- | ------------ | -------------------------------- |
| wildcard    | `*`          | every value                      |
| list        | `1,15,30`    | those values                     |
| range       | `1-5`        | inclusive range                  |
| step        | `*/5`        | every 5th value                  |
| range+step  | `1-30/2`     | every 2nd value in `1–30`        |
| month names | `JAN`–`DEC`  | case-insensitive                 |
| weekday names | `SUN`–`SAT` | case-insensitive                 |

Like Vixie cron, when **both** day-of-month and day-of-week are restricted a day
matches if **either** matches.

All matching is done in **UTC**.

- `parseCron(expr)` → the parsed `CronFields` (throws on a malformed expression).
- `nextRun(expr, after)` → the next `Date` strictly after `after` matching `expr`.

```ts
nextRun("*/15 * * * *", new Date("2026-01-01T00:07:00Z")); // → 00:15:00Z
nextRun("0 9 * * MON",  new Date("2026-01-01T12:00:00Z")); // → next Mon 09:00Z
```

## Schedule kinds

A job's `schedule` is one of:

- a **cron string** — `"0 */6 * * *"`;
- `{ every: number }` — fixed **interval** in ms;
- `{ at: Date }` — **one-off** at an absolute instant;
- `{ after: number }` — **one-off** after a delay in ms.

Interval and cron jobs re-arm a per-job timer to their own next fire. One-offs
fire once and are not rescheduled.

## Overlap policy

If a previous run is still in flight when the next fire arrives:

- `overlap: false` (default) — the occurrence is **skipped** (no concurrent run);
- `overlap: true` — both run.

Re-arming happens immediately on each fire, so a slow handler never stalls the
schedule — only the overlapping *run* is skipped.

## Error handling

`onError(err, job)` (per scheduler) catches any handler rejection/throw so one
failure never breaks the schedule — the job is **always** rescheduled to its next
occurrence.

## Introspection & manual control

- `list()` → `[{ name, nextRun: Date | null, running: boolean }]`.
- `trigger(name)` → run a job's handler **now**, returning its result/promise
  (bypasses the overlap policy and the leader-lock — it's a manual action).

## Leader-lock: run once across a fleet

When you run several instances behind a load balancer, you usually want a cron job
to fire **exactly once per occurrence**, not once per instance. Pass a `store`
(any object with an atomic `incr(key, { ttl }) → Promise<number>` — satisfied
structurally by [`@youneed/kv`](../kv)'s `KV`, e.g. the shared
[`@youneed/kv-redis`](../kv-redis) adapter):

```ts
import { createScheduler } from "@youneed/server-plugin-jobs";
import { RedisKV } from "@youneed/kv-redis";

const store = new RedisKV({ url: process.env.REDIS_URL });

createScheduler({ store, lockTtl: 60 })
  .add({ name: "nightly-billing", schedule: "0 0 * * *", handler: () => bill() })
  .start();
```

Before running a tick the scheduler does
`store.incr("job:<name>:<slot>", { ttl })` where `slot` is the scheduled fire
time. Only the instance whose `incr` returns `1` (it created the key) runs the
occurrence; the others get `> 1` and skip. The TTL (`lockTtl`, default `30`s)
lets the key expire so the slot doesn't linger forever.

> The core has **no hard dependency** on `@youneed/kv` — it defines a local
> structural `LockStore` interface that `KV` happens to satisfy.

## Determinism

`createScheduler(opts)` accepts injectable primitives:

- `now?: () => number` — clock in epoch ms (default `Date.now`).
- `setTimer?: (cb, ms) => Handle` / `clearTimer?: (h) => void` — default wrap
  `setTimeout`/`clearTimeout` (the timer is `.unref()`'d so it won't keep the
  process alive).

In tests, inject a fake clock (`let t = 0; now = () => t`) and a timer registry
you can `advance(ms)` — no real time passes.

## API

```ts
jobs(opts?: JobsPluginOptions): ServerPlugin & { scheduler: Scheduler }
createScheduler(opts?): Scheduler
class Scheduler {
  add(job): this
  start(): this
  stop(): this
  trigger(name): Promise<unknown>
  list(): JobInfo[]
}
parseCron(expr): CronFields
nextRun(expr, after): Date
```

Types: `Job`, `Schedule`, `EverySchedule`, `AtSchedule`, `AfterSchedule`,
`LockStore`, `SchedulerOptions`, `JobsPluginOptions`, `JobInfo`, `CronFields`,
`TimerHandle`.
