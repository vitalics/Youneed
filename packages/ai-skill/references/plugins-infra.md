# Plugins & Infra — the ServerPlugin system

`@youneed/server` plugins extend the app at **lifecycle boundaries** instead of
wrapping requests from the outside. They wire infrastructure — schedulers, KV
stores, workers, devtools — and self-describe it via `inspect()` for the topology
view. See `./server.md` for the builder, `./middleware.md` for per-request work,
`./auth.md` for login plugins (OAuth2/OTP).

## Plugin vs middleware

| | Middleware (`app.use`) | Plugin (`app.plugin`) |
| --- | --- | --- |
| scope | every matching **request** | the **app lifecycle** |
| signature | `(ctx, next) => unknown` | `{ name, setup?, beforeListen?, onListen?, onShutdown?, inspect? }` |
| runs | on each request, onion order | once at register / listen / drain |
| use for | auth, logging, CORS, rate-limit, compression | jobs, cluster, stores, docker-gen, devtools, env |

A plugin can *add* middleware/routes/controllers in `setup`, so the two compose.

## The `ServerPlugin` contract

Source: `packages/server/src/server.ts`.

```ts
interface ServerPlugin {
  name: string;
  setup?(app: AppBuilder): void;                 // at register — add middleware/routes, read config
  beforeListen?(info: { port; opts }): boolean | void; // return false to TAKE OVER the bind
  onListen?(http: HTTP): void | Promise<void>;   // server is listening — start background work
  onShutdown?(): void | Promise<void>;           // graceful drain — stop work (runs LIFO)
  inspect?(): unknown;                           // small JSON-safe infra description for topology()
}
```

`app.plugin(...plugins)` runs each `setup` immediately. `onListen` runs in
registration order after the socket binds; `onShutdown` runs **LIFO** during
`gracefulShutdown`. `beforeListen` returning `false` means the server does **not**
bind (e.g. a cluster primary forks workers instead). `inspect()` payloads surface in
`app.topology().plugins` and the devtools Infra view.

## Writing a minimal plugin

```ts
import type { ServerPlugin } from "@youneed/server";

function metricsPusher(opts: { url: string }): ServerPlugin {
  let timer: NodeJS.Timeout;
  return {
    name: "metrics-pusher",
    setup(app) { app.get("/__metrics-ping", () => "ok"); }, // optional: add routes
    onListen() { timer = setInterval(() => push(opts.url), 10_000).unref(); },
    onShutdown() { clearInterval(timer); },                 // stop on drain
    inspect() { return { kind: "exporter", url: opts.url }; }, // shows in topology
  };
}

app.plugin(metricsPusher({ url: "https://collector.internal" }));
```

## Infra plugins

### `@youneed/server-plugin-jobs` — cron / interval scheduler

Clock-time jobs (distinct from the DOM microtask scheduler). `jobs()` binds a
`Scheduler` to the lifecycle: `start()` on `onListen`, `stop()` on `onShutdown`.

```ts
import { jobs } from "@youneed/server-plugin-jobs";

const cron = jobs({ jobs: [{ name: "cleanup", schedule: "0 */6 * * *", handler: purge }] });
app.plugin(cron).listen(3000, () => {});
cron.scheduler.add({ name: "heartbeat", schedule: { every: 30_000 }, handler: ping });
```

`schedule` is a 5/6-field cron string, `{ every: ms }`, `{ at: Date }`, or
`{ after: ms }`. `overlap: false` (default) skips an occurrence if the prior run is
still in flight. Also exports `createScheduler`, `parseCron`, `nextRun`.

**Leader-lock (run once across a fleet):** pass a `store` with atomic
`incr(key, { ttl })` — satisfied by any `@youneed/kv` (e.g. `RedisKV`). Before a
tick it does `incr("job:<name>:<slot>", { ttl })`; only the instance that gets `1`
runs that occurrence.

```ts
import { createScheduler } from "@youneed/server-plugin-jobs";
import { RedisKV } from "@youneed/kv-redis";
createScheduler({ store: new RedisKV({ url: process.env.REDIS_URL }), lockTtl: 60 })
  .add({ name: "nightly-billing", schedule: "0 0 * * *", handler: bill }).start();
```

### `@youneed/server-plugin-cluster` — multi-core supervisor

Forks N workers over `node:cluster`, respawns crashes (crash-loop backstop), drains
on SIGTERM. The **same module** runs in primary and workers.

```ts
import { cluster } from "@youneed/server-plugin-cluster";
Application().get("/", () => Response.text("ok"))
  .plugin(cluster({ workers: 4 }))   // default os.availableParallelism()
  .listen(3000, (s) => s.gracefulShutdown());
```

In the primary `beforeListen` starts a `Supervisor` and returns **`false`** (takes
over — doesn't bind); each worker re-runs the module, returns nothing, and binds the
port. Pair with the worker's own `gracefulShutdown` for zero-downtime restarts. Also
exports `runCluster`, `Supervisor`.

### `@youneed/server-plugin-store` — the KV contract

The distributed key-value contract (`KV`) + in-process `MemoryKV`. Consumers
(session store, rate-limit, distributed cache) take a `KV` and don't care about the
backend. Values are **strings**, TTLs in **seconds**.

```ts
import { MemoryKV, namespaced, type KV } from "@youneed/server-plugin-store";
const kv: KV = new MemoryKV();
await kv.set("user:1", JSON.stringify({ name: "Ada" }), { ttl: 60 });
await kv.incr("hits", { ttl: 60 });        // atomic; ttl set only on creation
const sessions = namespaced(kv, "sess");   // keys become "sess:<key>"
```

`KV`: `get`/`set`/`delete`/`incr`/`expire`/`ttl`, optional `scan`/`close`. Multi-node
→ `RedisKV` from `@youneed/kv-redis` (aliased by `@youneed/server-plugin-pubsub-redis`),
or `postgresKV`/`DenoKV` from the matching pubsub adapter. See `./middleware.md` for
wiring it into `session`/`rate-limit` (each via its own adapter, no shared `store`).

### `@youneed/server-plugin-env` — fail-fast env

Coerce + validate `process.env` against a `@youneed/schema` `t` spec; throws one
aggregated `EnvError` at boot. Secret values masked in errors and topology.

```ts
import { environment, t } from "@youneed/server-plugin-env";
const envPlugin = environment({
  schema: { PORT: t.port().default(3000), DATABASE_URL: t.url().secret() },
});
app.plugin(envPlugin);
envPlugin.values.PORT;   // typed, validated
```

Standalone `defineEnvironmentVariables(source, { schema })` + `describeEnv` for a
redacted log view.

### `@youneed/server-plugin-docker` — build-time artifact generator

`docker()` is a **build-time** plugin: in `beforeListen` it generates a Dockerfile,
`docker-compose.yml`, and `.dockerignore`, **inferring** compose services from the
mounted plugins (via `app.topology().plugins`), then exits. Mount it **last** so it
sees your ORM / pubsub / kv plugins.

```ts
import { docker } from "@youneed/server-plugin-docker";
app.plugin(docker());           // emits when EMIT_DOCKER is set (or { emit: true })
```

`{ infer, services, outDir, emit, exitAfterEmit }`. Also exports `writeDocker`.

### `@youneed/server-plugin-devtools` — devtools MPA

`devtools()` is a `ServerPlugin` that mounts an Encore-style devtools site (topology,
OWASP security audit, OpenAPI, microbench) built from the topology model.

```ts
import { devtools, serveDevtools } from "@youneed/server-plugin-devtools";
app.plugin(devtools({ name: "users-api", middleware: ["cors", "helmet", "rate-limit"] }));
// or imperatively on a built app: serveDevtools(app, { ... })
```

The pure analysis core is also exported (`topology`, `externalServer`,
`securityAudit`, `auditGrade`, `toOpenApi`, `microbench`). Pub/Sub and JSON-RPC
plugins contribute their own devtools tabs — see `./realtime.md`.
