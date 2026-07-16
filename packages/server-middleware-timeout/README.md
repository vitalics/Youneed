# @youneed/server-middleware-timeout

Fail a request that exceeds a deadline (default `503 Request Timeout`), so a slow
handler returns a timely error instead of hanging the client.

```ts
import { Application } from "@youneed/server";
import { timeout } from "@youneed/server-middleware-timeout";

Application()
  .use(timeout(5000))                              // 5s, global
  .use("/report", timeout(30_000, { status: 504 })) // scoped, custom status
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `status` | `503` | status thrown on timeout |
| `message` | `{ error: "Request Timeout" }` | response body |

> The handler keeps running (Node can't cancel it) — the timeout only stops the
> client from waiting. Pair it with `AbortSignal`-aware work where possible.
