# @youneed/server-middleware-server-timing

Emit a [`Server-Timing`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing)
response header so server-side phases show up in the browser's DevTools
(Network → a request → **Timing**).

```ts
import { Application, Response } from "@youneed/server";
import { serverTiming, timing } from "@youneed/server-middleware-server-timing";

const app = Application()
  .use(serverTiming())                       // register EARLY → accurate `total`
  .get("/users", async (ctx) => {
    const m = timing(ctx).metric("db");        // start a timer…
    const rows = await db.query("…");
    m.desc(`SQL · ${rows.length} rows`).stop(); // …set desc from the result, then stop
    return Response.json(rows);
  });
//  Server-Timing: db;dur=12.3;desc="SQL · 42 rows", total;dur=14.1
```

## API

- **`serverTiming(opts?)`** — middleware. Collects metrics for the request and
  writes the `Server-Timing` header on the way out (skipped if the handler already
  streamed/sent the response). Options:
  - `total` — add a metric for the whole request: `true` (default, name `"total"`),
    a string to rename it, or `false` to disable.
  - `precision` — decimal places for `dur` values (default `2`).
  - `enabled(ctx)` — gate emission per request (the header exposes internal timings;
    you may want it dev-only). Default: always on.
- **`timing(ctx)`** — the per-request recorder (a no-op if the middleware isn't
  installed, so handlers stay safe):
  - `metric(name, desc?)` — start a configurable metric; the handle is chainable:
    - `.desc(text)` — set/override the description (e.g. after the work, from the result),
    - `.dur(ms)` — set an explicit duration (overrides the timer),
    - `.stop()` — record the elapsed time. An **unstopped** metric is auto-finalized
      to "time until the response".
  - `start(name, desc?)` → returns a `stop()` (shorthand for `metric().stop`).
  - `measure(name, fn, desc?)` — time a sync/async `fn`, record it, return its result.
  - `add(name, dur?, desc?)` — record a precomputed metric.

```ts
// custom measurements, fully under your control:
const m = timing(ctx).metric("render", "templating");
renderPage();
m.stop();                                   // dur = elapsed
timing(ctx).add("queue-wait", upstreamMs);  // a value you measured elsewhere
timing(ctx).metric("region").dur(0).desc(process.env.REGION ?? "local"); // label-only marker
```

Names are coerced to valid HTTP tokens; `desc` is emitted as a quoted string.
Register the middleware as early as possible (outermost) so `total` covers the
full request.
