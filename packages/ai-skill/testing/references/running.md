# @youneed/test — Running tests

Source: `packages/test/src/{index,cli}.ts`, `packages/test/README.md`, `packages/test-*`.

## Programmatic run (the builder)

```ts
const summary = await TestApplication()
  .addTests(SuiteA, SuiteB)          // explicit classes…
  .addPattern("src/**/*.test.ts")    // …or discover by glob (relative to cwd)
  .context({ browser: "firefox" })   // run-level params → every ctx.metadata
  .timeout(5000)                     // default per-test timeout (ms)
  .reporter(new ConsoleReporter())   // 0+ reporters (class or instance)
  .use(benchmark(), retry(2))        // 0+ plugins (runTest middleware)
  .webServer({ command, url })       // 0+ web servers as preconditions
  .run({ setExitCode: true });       // → RunSummary; exitCode=1 on failure unless false
```

Suites are just exported classes — a test file does `export class S extends Test() {}`
and the CLI / `addPattern` collects them by brand.

## CLI (`youneed-test`)

```sh
youneed-test                       # run **/*.test.{ts,tsx,js,jsx,mts,mjs}
youneed-test "src/**/*.spec.ts"    # custom globs
youneed-test -w                    # watch + re-run on change
youneed-test --parallel 4          # in-process async lanes
youneed-test --workers 4           # forked worker processes (blobs merged)
youneed-test --shard 2/4 --blob    # one CI shard + blob
youneed-test --timeout 5000        # default per-test timeout (ms)
youneed-test --web-server "node server.js" --web-server-url http://127.0.0.1:3000
youneed-test --reporter console --reporter junit --output junit.xml
```

`--reporter <name>` loads a built-in (`default`, `noop`) or a
`@youneed/test-reporter-<name>` package by name. For `.ts` files run under a TS
loader: `node --import tsx node_modules/.bin/youneed-test`.

## Parallelism, sharding, blob merge

Three independent dials, same model as Playwright (workers + `--shard` + blob):

- **`.parallel(n)`** — `n` async lanes in **one process**. Best for I/O-bound async
  tests. Each lane buffers events; they're merged in lane order and replayed so
  console output is never interleaved. `durationMs` is real wall-clock.
- **`.workers(n)`** (alias `.shards(n)`) — forks `n` **processes**, each runs its
  partition with a `BlobReporter` only; the coordinator merges + replays the blobs.
  Best for CPU-bound suites. Re-executes the entry, so keep post-`.run()` code minimal.
- **`.shard("i/n")`** — run a deterministic subset in-process (with real reporters);
  pair with `.blob()` per CI job, then merge.

```ts
import { mergeReports, ConsoleReporter } from "@youneed/test";
await mergeReports({ dir: "blob-report", reporters: [new ConsoleReporter()] });
```

Each lane/worker gets its own `"run"`-scope fixtures. `ctx.run` (`{ mode, lane,
lanes, shard }`) tells a test/reporter where it's executing.

## Reporters (pluggable packages)

Built-in: `DefaultReporter` (quiet — failures + summary, used when none registered)
and `NoopReporter` (silent — register it to just read the `RunSummary`). Everything
richer is an independent package, install only what you want:

| Package | Output |
|------|------|
| `@youneed/test-reporter-console` | colored per-test/suite + annotations |
| `@youneed/test-reporter-progress` | live, interactive per-lane progress (parallel/shard) |
| `@youneed/test-reporter-tap` | TAP v13 (CI / node:test-compatible) |
| `@youneed/test-reporter-junit` | JUnit XML file (`{ output }`) |
| `@youneed/test-reporter-html` | standalone HTML report file (`{ output }`) |

Write your own by extending `Reporter({ name })` and decorating handlers with
`@Reporter.event(name, { priority? })`. Events: `onRunStart`, `onSuiteStart`(SuiteInfo),
`onTestStart`(TestContext), `onTestEnd`(TestResult), `onSuiteEnd`, `onRunEnd`(RunSummary),
plus the LIVE `onProgress`(ProgressEvent) — emitted as each test starts/ends even
during a `.parallel()` run — and any custom string event a plugin emits.

## Live devtools UI server (@youneed/test-devtools)

A reporter that boots a small HTTP server (`@youneed/server`) with a live web UI —
streams the run over SSE so you watch suites/tests, statuses, durations, errors,
steps, annotations and per-lane progress in the browser. Great for writing tests
fast in watch mode.

```ts
import { DevtoolsReporter } from "@youneed/test-devtools";

await TestApplication().addTests(S)
  .reporter(new DevtoolsReporter({ port: 0, open: true /* , persist, host */ }))
  .run();
// → youneed test devtools → http://127.0.0.1:<port>
```

`persist` (default `true`) keeps the server alive after the run so you can inspect;
call `.close()` to stop it. New tabs replay the buffered run, so opening late shows
everything.

## Plugins (extensions)

Register with `.use(plugin)`. A plugin is `{ name, setup?, teardown?, runTest? }`;
`runTest` is middleware around each case (call `next()` once, or loop it). Compose in
registration order (innermost = body).

| Package | What |
|------|------|
| `@youneed/test-plugin-benchmark` | `benchmark()` plugin + `@Benchmark` — loops a case, measures ops/sec |
| `@youneed/test-resilience` | `timeout(ms)` / `retry(n)` plugins (+ `@Timeout`/`@Retry`) — compose for per-attempt timeouts under retry |
| `@youneed/test-snapshot` | `snapshot()` plugin + `toMatchSnapshot` |

## Web server as a precondition (à la Playwright)

```ts
await TestApplication().addTests(...e2eSuites)
  .webServer({
    command: "node ./server.js",          // run via shell
    url: "http://127.0.0.1:3000/health",  // …or port: 3000 (waits for TCP)
    timeout: 60_000,                       // readiness budget (default 60s)
    reuseExistingServer: true,             // default: true off-CI, false on CI
    // cwd, env, stdout
  })
  .run();
```

The run waits until the `url` responds (any HTTP status counts; only a refused
connection is "not ready") or the `port` accepts a connection, then runs the tests,
then kills the process group on teardown. `reuseExistingServer` reuses an
already-listening target and leaves it running. Pass an array to start several. Also
available as the plugin `webServer(opts)` (`.use(webServer(opts))`) and CLI flags
`--web-server` / `--web-server-url` / `--web-server-port` / `--web-server-timeout`.
