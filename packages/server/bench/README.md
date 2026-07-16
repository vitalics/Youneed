# @youneed/server — benchmarks

Three harnesses: per-endpoint latency (`bench`), in-process throughput vs Fastify
/ raw node (`bench:load`), and a cross-framework / cross-runtime throughput
shoot-out (`bench:frameworks`).

## `bench` — latency (hyperfine + curl)

```sh
pnpm --filter @youneed/server bench           # full
pnpm --filter @youneed/server bench:quick     # 1/4 the runs
pnpm --filter @youneed/server bench -- --endpoints=json,text --runs=300
```

`bench/bench.mjs` boots `app.ts` once (node + tsx) and drives
[`hyperfine`](https://github.com/sharkdp/hyperfine) + `curl` over each endpoint:

| key | what it exercises |
| --- | --- |
| `file` | `File()` static-file path (stat + stream) |
| `json` | `Response.json` |
| `json-typed` | response schema → compiled serializer |
| `json-cached` | compiled response cache (replayed bytes) |
| `text` | `Response.text` |
| `crud` | create → read → update → delete cycle (`crud.sh`) |
| `sse` | bounded SSE stream |
| `ws` | WebSocket connect → send → echo → close (`ws-client.mjs`) |

Results land in `bench/results/{RESULTS.md,results.json}`.

> **WebSocket caveat.** `ws` is timed via a tiny node client process, so the
> number is dominated by node's startup (tens of ms) — read it as a relative
> WebSocket signal, not raw per-message latency.

> **Caveat.** hyperfine+curl times one request *including* curl's process
> startup (~ms floor), so absolute numbers understate raw server speed. Use it
> for relative before/after on the same machine. For req/s under load, use:

## `bench:load` — throughput (autocannon)

```sh
pnpm --filter @youneed/server bench:load
```

`bench/throughput.bench.ts` hits `GET /json` with keep-alive + concurrency via
`autocannon`, comparing our server against Fastify and bare `node:http`
in-process. This is the right tool for measuring our own server optimizations
(req/s, p99) without process/runtime noise.

## `bench:frameworks` — cross-framework throughput (autocannon)

```sh
pnpm --filter @youneed/server bench:frameworks
pnpm --filter @youneed/server bench:frameworks -- --endpoint=/text --connections=100 --duration=8
```

`bench/frameworks.bench.ts` compares — one process at a time, so they never
contend — `@youneed/server` run under **node**, **Bun** and **Deno** (the same
`apps/ours.ts`, on each runtime's `node:http` compat) against **Node native**
(`node:http`), **Bun native** (`Bun.serve`), **Deno native** (`Deno.serve`),
**Express**, **Elysia** (node adapter) and **NestJS** (platform-express). Each
app in `bench/apps/` boots in its OWN process under the right runtime — `node`,
`node --import tsx`, `bun` or `deno run -A` — and autocannon hammers one endpoint
(`/json` by default). The table prints req/s, p99 and relative speed.

| flag | default | meaning |
| --- | --- | --- |
| `--endpoint` | `/json` | route to hit (`/json` · `/text` · `/health`) |
| `--connections` | `50` | concurrent keep-alive connections |
| `--duration` | `6` | measured seconds (after a 2s warmup) |

> The **Bun** and **Deno** entries (our server on those runtimes, plus Bun
> native) are skipped automatically when the runtime isn't on `PATH`. **NestJS**
> runs through `tsx` with `apps/nest.tsconfig.json` (legacy decorators +
> `emitDecoratorMetadata`). Numbers drift between runs (shared machine,
> sequential combos) — trust back-to-back deltas on one box, not absolutes.

Requires `hyperfine`, `curl`, and `bash` on `PATH` for the latency harness;
`bun` and `deno` are optional (only for their respective runtime entries).
