# @youneed/test-devtools

A live web-UI reporter for [`@youneed/test`](../test). It boots a tiny HTTP
server (on [`@youneed/server`](../server)) that serves one self-contained page and
**streams the run to your browser over Server-Sent Events** — so you watch
suites, tests, statuses, durations, errors, steps and annotations update in real
time while you write tests.

## Install

```bash
pnpm add -D @youneed/test @youneed/test-devtools
```

## Use

```ts
import { TestApplication } from "@youneed/test";
import { DevtoolsReporter } from "@youneed/test-devtools";

await TestApplication()
  .addTests(MyTest)
  .reporter(new DevtoolsReporter({ open: true }))   // opens the UI in your browser
  .run();
```

On the first event the reporter prints the URL it's serving:

```
youneed test devtools → http://127.0.0.1:54231
```

By default (`persist: true`) the server keeps running after the run finishes so
you can keep inspecting the report — the process stays alive until you stop it
(Ctrl-C) or call `reporter.close()`. For a one-shot / CI run, pass
`persist: false` so the server shuts down on `onRunEnd`.

Compose it with other reporters (e.g. the console one):

```ts
TestApplication()
  .addTests(...suites)
  .reporter(new ConsoleReporter())        // @youneed/test-reporter-console
  .reporter(new DevtoolsReporter())
  .run();
```

## What it shows

- a sticky header with live aggregates — passed / failed / skipped / total /
  elapsed ms — and a pass/fail/skip ratio bar;
- a per-lane strip during `.parallel()` / sharded runs (which test is running
  where), driven by the `onProgress` event;
- a collapsible **suite → test** tree with status icons (✓ / ✗ / ○) and durations;
- failed tests auto-expand to show the error message + stack;
- nested **steps** (`ctx.step(...)`) with their timings, **annotations**
  (`ctx.annotate(...)`) and **attachments** (`ctx.attach(...)` / `metadata.attachments`).

Open the page late and you still see everything: the server buffers the whole
event stream and replays it to any client that connects.

## API

`new DevtoolsReporter(options?)`

| option | default | description |
| --- | --- | --- |
| `port` | `0` | Port to listen on. `0` picks a free random port; the real URL is printed. |
| `host` | `"127.0.0.1"` | Bind address. |
| `open` | `false` | Open the UI in the default browser when ready (best-effort, never throws). |
| `persist` | `true` | Keep the server alive after the run. `false` closes it on `onRunEnd`. |

Methods / properties:

- `reporter.url` — the URL the UI is served at (empty until the server starts).
- `reporter.close()` — stop the server and disconnect all SSE clients (idempotent).

The page has **no external dependencies** (no CDN) — HTML, CSS and JS are inlined,
served from `GET /`, and the event stream is `GET /events` (`text/event-stream`),
one JSON-encoded event per `data:` frame. `Error`s are flattened to
`{ name, message, stack }` so they survive serialization.
