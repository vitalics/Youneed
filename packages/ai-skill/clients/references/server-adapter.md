# @youneed/server-adapter — run the server on any runtime

Run **one** `@youneed/server` app on Node, Bun, Deno, or an edge/serverless `fetch` handler
(Cloudflare Workers, Vercel/Netlify edge, Lambda function URLs). The core speaks `node:http`
`(req, res)`; this bridges it to the Web `fetch(Request) => Response` shape.

```ts
import { Application } from "@youneed/server";
import { serve, toFetchHandler } from "@youneed/server-adapter";

const app = Application().get("/hello", () => ({ hello: "world" }));

// 1) One-liner for Node / Bun / Deno (auto-detects the runtime):
const server = await serve(app, { port: 3000 });
console.log(server.runtime, server.url);          // "node http://localhost:3000"

// 2) A raw Web fetch handler for edge / serverless:
export default { fetch: toFetchHandler(app) };     // Cloudflare Worker
// Bun:  Bun.serve({ fetch: toFetchHandler(app) })
// Deno: Deno.serve(toFetchHandler(app))
```

## How it works

`app.handler()` (added to `@youneed/server`) returns a runtime-agnostic Node request listener
over the compiled routes. `toFetchHandler(app)` builds it **once**, then per request:
- shims the incoming `Request` into a Node `IncomingMessage` (method, url, headers, buffered
  body);
- collects the Node `ServerResponse` into a **streaming** `Response` (status + headers committed
  on first write, body piped through a `ReadableStream` — so **SSE / file streaming keep
  working**);
- no-body statuses (204/205/304/101) resolve to a `Response` with `null` body.

## Adapters

`nodeAdapter`, `bunAdapter`, `denoAdapter` each implement `RuntimeAdapter` (`available()` +
`serve()`). `detectAdapter()` returns the one matching the current runtime (Bun → Deno →
Node); `serve(app, opts)` uses it.

## When to reach for it

- **Deploy to edge/serverless** — export `toFetchHandler(app)` as the platform's `fetch` entry.
- **Bun/Deno target** (incl. a migration off Bun.serve/Deno.serve → `@youneed/server`) — `serve`
  runs the same app with runtime auto-detection; see the `youneed-migration` skill's
  `references/tooling.md`.
- Streaming responses survive the bridge, so SSE endpoints and `File(...)` downloads work on
  edge runtimes without change.
