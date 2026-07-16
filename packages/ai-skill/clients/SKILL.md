---
name: youneed-clients
description: "The HTTP boundary of a youneed app — consuming APIs and running the server on any runtime. @youneed/api-client: a typed API-client runtime plus an OpenAPI → TypeScript client codegen (CLI youneed-api-codegen + programmatic generateClient) that consumes the OpenAPI doc @youneed/server emits, so there's no hand-written fetch and no server/client drift; dependency-free (global fetch, or pass @youneed/http-client). @youneed/http-client: a zero-dependency universal resilient fetch wrapper (per-attempt timeout, retry with exponential backoff + full jitter honoring Retry-After and only retrying idempotent methods by default, and a circuit breaker) that works in Node/Bun/Deno/browser. @youneed/server-adapter: run one @youneed/server app on any runtime — a Web fetch(Request)=>Response bridge over the app's node:http listener for edge/serverless (Cloudflare Workers, Vercel/Netlify edge, Lambda) plus node/bun/deno serve adapters with runtime auto-detection. Use this skill when generating or consuming a typed API client, making resilient outbound HTTP calls, or deploying/serving a youneed server on Bun/Deno/edge/serverless."
license: ISC
---

# youneed — Clients & Runtime Adapters (the HTTP boundary)

Three packages at the edges of a youneed app: generate a **typed client** for its API,
make **resilient outbound** calls, and **serve the app on any runtime**. All zero- or
near-zero-dependency and `fetch`-based (except gRPC/etc, which live elsewhere).

Source of truth: `packages/{api-client,http-client,server-adapter}/src`. Verify a signature
before asserting it.

## Route to the reference

| Task | Read |
|------|------|
| Generate / use a typed client from the server's OpenAPI doc (CLI + runtime) | `references/api-client.md` |
| Resilient outbound HTTP — timeout, retry+backoff, circuit breaker | `references/http-client.md` |
| Run/deploy the server on Node / Bun / Deno / edge / serverless (fetch bridge) | `references/server-adapter.md` |

## At a glance

```ts
// 1) Codegen a typed client from the running server's OpenAPI:
//    youneed-api-codegen --input http://localhost:3000/openapi.json --output src/api.ts --name PetStore
import { PetStore } from "./src/api";
const api = new PetStore({ baseUrl: "https://api.example.com", headers: { authorization: `Bearer ${t}` } });
const users = await api.getUsers();                     // fully typed from the spec

// 2) Resilient outbound fetch:
import { createClient } from "@youneed/http-client";
const client = createClient({ timeout: 5_000, retries: 3, failureThreshold: 5 });
await client.post("https://api.example.com/users", { body: JSON.stringify({ name: "Ada" }) });

// 3) Serve on any runtime:
import { serve, toFetchHandler } from "@youneed/server-adapter";
export default { fetch: toFetchHandler(app) };          // Cloudflare Worker / Bun / Deno
```

## How they fit together

- **Schema is the contract.** The server's `t.*` schemas generate the OpenAPI doc; `api-client`
  turns that doc into a typed client. Run codegen in CI so drift fails the build — this is the
  replacement for tRPC's router-type import.
- **`http-client` is the transport** the generated client can use — pass it to `api-client` so
  every generated call gets timeout/retry/breaker; or use it standalone for any outbound call.
- **`server-adapter` bridges `node:http` → Web `fetch`.** The server core speaks `(req, res)`;
  the adapter shims a `Request` in and streams a `Response` out, so SSE/file streaming keep
  working on edge/serverless. Key to a Bun/Deno/edge migration or deploy.

## Ground rules

- **Only idempotent methods retry by default** — don't blanket-retry `POST` without an
  idempotency key (pair with `@youneed/server-middleware-idempotency`).
- **The circuit breaker fails fast** while a dependency is down — inspect `client.breaker.state`.
- **`toFetchHandler` builds the listener once**, then shims per request — no per-call app rebuild.
- **Regenerate the client on spec change**, don't hand-edit `src/api.ts`.
