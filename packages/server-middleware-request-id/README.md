# @youneed/server-middleware-request-id

Per-request **correlation id** for [`@youneed/server`](../server). Each request
gets a stable id — a trusted inbound `X-Request-Id` (set by your load balancer /
upstream) is reused, otherwise a fresh one is minted. The id is exposed on
`ctx.state`, echoed on the response, and bound to the request logger so every log
line for that request is correlated. Zero dependencies.

```ts
import { requestId, getRequestId } from "@youneed/server-middleware-request-id";
import { requestLogger } from "@youneed/server-middleware-request-logger";

app.use(requestId());          // mount EARLY (before the logger)
app.use(requestLogger());

app.get("/x", (ctx) => ({ id: getRequestId(ctx) }));
```

## Behaviour

- **Reuse vs mint** — a valid inbound id (default charset `[\w.\-:]`, ≤200 chars)
  is reused; otherwise `crypto.randomUUID()` mints one.
- **Echo** — the id is written back on the response header (default the same
  header name) so clients/proxies can trace it.
- **Log correlation** — if a logger middleware put a child-capable logger on
  `ctx.state.log`, the id is bound to it (`{ requestId }` on every line).

## Trust boundary

At the **edge** of an untrusted network, set `trustInbound: false` so clients
can't spoof/poison your correlation ids. Behind a trusted proxy that already
stamps ids, keep the default (`true`) so the id flows end-to-end.

## Options

| option | meaning |
| --- | --- |
| `header` | Inbound/echo header (default `"x-request-id"`). |
| `responseHeader` | Response header name, or `false` to not echo (default = `header`). |
| `generate` | Id factory (default `crypto.randomUUID`). |
| `trustInbound` | Reuse a valid inbound id (default `true`). |
| `validate` | Inbound-id sanity check (default `[\w.\-:]{1,200}`). |
| `stateKey` | Where to store the id (default `"requestId"`). |
