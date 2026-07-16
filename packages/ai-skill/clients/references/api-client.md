# @youneed/api-client — typed client runtime + OpenAPI codegen

Consumes the OpenAPI document `@youneed/server` already emits (`app.openapi({...})`) and
generates a fully-typed TS client — no hand-written fetch, no server/client drift.
Dependency-free (global `fetch`, or pass `@youneed/http-client` for resilience).

## Generate a client

From a live server or a spec file, via the CLI:
```bash
youneed-api-codegen --input http://localhost:3000/openapi.json --output src/api.ts --name PetStore
youneed-api-codegen -i ./openapi.json -o ./src/api.ts        # from a file
```
…or programmatically:
```ts
import { generateClient } from "@youneed/api-client/codegen";
const code = generateClient(openApiDoc, { className: "PetStore" });   // → .ts source string
```

## Use the generated client

```ts
import { PetStore } from "./src/api";

const api = new PetStore({ baseUrl: "https://api.example.com", headers: { authorization: `Bearer ${token}` } });

const users = await api.getUsers();                               // typed: { id: number; name: string }[]
const one = await api.getUsersById({ id: 7, query: { expand: true } });
const created = await api.postUsers({ body: { name: "ada" } });
```
Each operation becomes a typed method: path params + `query` + `body` typed from the spec's
schemas, return type = the `2xx` response schema. A non-2xx response throws `ApiError`
(`{ status, body }`).

## Runtime

The generated class extends **`ApiClientBase`** (exported here). Constructor options include
`baseUrl`, default `headers`, and a `fetch` implementation — pass `@youneed/http-client`'s
client for timeout/retry/circuit-breaker on every call:
```ts
import { createClient } from "@youneed/http-client";
const api = new PetStore({ baseUrl, fetch: createClient({ timeout: 5000, retries: 3 }) });
```

## Workflow

1. Keep the server's `t.*` schemas authoritative — they generate the OpenAPI doc.
2. Run `youneed-api-codegen` in CI against the spec; commit `src/api.ts` (or generate at build).
3. On any schema change the regenerated client's types shift, so mismatched call sites fail to
   compile — the build catches drift. This is the youneed replacement for tRPC's end-to-end
   router-type import (HTTP + a spec instead of a shared server type).
4. Never hand-edit the generated file.
