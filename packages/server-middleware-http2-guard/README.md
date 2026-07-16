# @youneed/server-middleware-http2-guard

Defend HTTP/2 connections against stream-multiplexing DoS — Rapid Reset
(CVE-2023-44487), concurrent-stream floods, and unbounded stream churn — by
instrumenting the underlying session once per connection and tearing it down
(GOAWAY + destroy) when a pattern crosses a threshold. A no-op on HTTP/1.1.

```ts
import { Application } from "@youneed/server";
import { http2Guard } from "@youneed/server-middleware-http2-guard";

Application()
  .use(http2Guard())                                   // defaults, global
  .use(http2Guard({ maxResetsPerWindow: 50, onAbuse: (i) => console.warn(i) }))
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `maxConcurrentStreams` | `100` | max streams open at once on one connection before tear-down |
| `windowMs` | `10_000` | sliding window (ms) over which resets are counted |
| `maxResetsPerWindow` | `100` | max aborted (RST_STREAM) streams per window before tear-down |
| `maxStreamsPerSession` | `0` | max streams over a connection's whole life (`0` = unlimited) |
| `onAbuse` | — | called right before an abusive connection is torn down |

> Complements — doesn't replace — Node's `maxConcurrentStreams` /
> `maxSessionMemory` server settings. Header-assembly floods (CVE-2024-27316)
> happen before any request exists; cap them with `maxHeaderListSize` /
> `maxSessionMemory` on the server, not here.
