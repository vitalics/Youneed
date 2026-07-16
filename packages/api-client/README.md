# @youneed/api-client

A typed API client **runtime** + an **OpenAPI → TypeScript client codegen**. It
consumes the OpenAPI document [`@youneed/server`](../server) already generates and
emits a fully-typed client — no hand-written fetch calls, no drift between server
and client. Dependency-free (global `fetch`, or pass
[`@youneed/http-client`](../http-client) for retries/timeouts).

## Generate a client

From a spec file or a live server, via the CLI:

```bash
youneed-api-codegen --input http://localhost:3000/openapi.json --output src/api.ts --name PetStore
# or a file:
youneed-api-codegen -i ./openapi.json -o ./src/api.ts
```

…or programmatically:

```ts
import { generateClient } from "@youneed/api-client/codegen";
const code = generateClient(openApiDoc, { className: "PetStore" }); // → .ts source string
```

## Use the generated client

```ts
import { PetStore } from "./src/api";

const api = new PetStore({ baseUrl: "https://api.example.com", headers: { authorization: `Bearer ${token}` } });

const users = await api.getUsers();                       // typed: { id: number; name: string }[]
const one = await api.getUsersById({ id: 7, query: { expand: true } });
const created = await api.postUsers({ body: { name: "ada" } });
```

Each operation becomes a typed method: path params + `query` + `body` are typed
from the spec's schemas, and the return type is the `2xx` response schema. A
non-2xx response throws `ApiError` (`{ status, body }`).

## Runtime

The generated class extends `ApiClientBase` (exported here):

- **`ApiClientOptions`** — `{ baseUrl, fetch?, headers? }`. `headers` may be a
  function (per-request auth). Pass `createClient()` from `@youneed/http-client`
  as `fetch` for resilience.
- **`ApiError`** — thrown on non-2xx: `{ status, body, method, path }`.
- `buildPath` / `buildQuery` — the URL helpers (exported for reuse/testing).

## Codegen API

- **`generateClient(doc, { className?, runtimeModule? })`** → `.ts` source.
- **`tsType(schema)`** — JSON Schema → TS type expression.
- **`methodName(method, path, operationId?)`** — the method-naming rule
  (`operationId` wins; else `getUsersById` from `GET /users/{id}`).

Method names dedupe automatically. The youneed OpenAPI uses inline schemas (no
`$ref`), so types are emitted inline in each method signature.
