# @youneed/server-plugin-graphql

A **GraphQL HTTP endpoint** for [`@youneed/server`](../server), powered by the
reference implementation [`graphql`](https://github.com/graphql/graphql-js). Give
it an SDL string (schema-first) or a pre-built `GraphQLSchema`, plus your
resolvers — and it serves a spec-compliant `POST`/`GET` endpoint with an in-browser
**GraphiQL** IDE and a devtools tab (a mini playground, the SDL, recent ops).

```ts
import { Application } from "@youneed/server";
import { graphql } from "@youneed/server-plugin-graphql";

const app = Application().plugin(
  graphql({
    schema: /* GraphQL */ `
      type Query {
        hello: String
        add(a: Int, b: Int): Int
      }
    `,
    rootValue: {
      hello: () => "hi",
      add: ({ a, b }: { a: number; b: number }) => a + b,
    },
    // context: (ctx) => ({ user: ctx.state.user }),   // per-request contextValue
    // path: "/graphql",                                // default
    // graphiql: true,                                  // GraphiQL on GET (browsers)
  }),
);
app.listen(3000);

// POST /graphql  { "query": "{ hello }" }        → { "data": { "hello": "hi" } }
// GET  /graphql  (from a browser)                → GraphiQL IDE
// GET  /graphql?query={hello}                    → { "data": { "hello": "hi" } }
```

> The export named `graphql` is the **plugin**. graphql-js's own execute function
> (also `graphql`) is imported internally aliased as `runGraphQL` to avoid the
> name collision.

## The plugin

`graphql(opts)` is a `ServerPlugin`. Options:

- **`schema`** — an SDL string (built with graphql-js `buildSchema`) or a
  pre-built `GraphQLSchema`. Validated on construction.
- **`rootValue` / `resolvers`** — the root resolver object (`fieldName → fn`).
  Both are merged (`rootValue` wins); an SDL schema resolves its `Query`/`Mutation`
  fields against this.
- **`context(ctx)`** — build the per-request `contextValue` handed to every resolver.
- **`path`** — endpoint path (default `"/graphql"`).
- **`graphiql`** — serve GraphiQL on `GET {path}` for HTML requests (default `true`).
- **`recentLimit`** — recent-ops ring buffer size for devtools (default `50`).

Routes mounted in `setup`:

- **`POST {path}`** — the standard `{ query, variables, operationName }` request →
  `{ data, errors }`. Missing `query` → `400`.
- **`GET {path}`** — GraphiQL when the browser asks for `text/html`; otherwise a
  simple `?query=&variables=` GET query.
- **`GET {path}/__schema`** — `{ sdl }` (for the devtools SDL viewer).
- **`GET {path}/__stats`** — `{ count, typeCount, recent }` (for the devtools tables).

## The pure helper

`executeOperation(schema, { query, variables, operationName }, { rootValue, contextValue })`
runs one operation and returns `{ data, errors }`. It's the exact code path the
routes use, so it's the unit under test:

```ts
import { buildSchema } from "graphql";
import { executeOperation } from "@youneed/server-plugin-graphql";

const schema = buildSchema(`type Query { hello: String }`);
await executeOperation(schema, { query: "{ hello }" }, { rootValue: { hello: () => "hi" } });
// → { data: { hello: "hi" } }
```

`createGraphQL(opts)` / `new GraphQL(opts)` build a standalone instance (`.execute`,
`.sdl`, `.recent()`, `.count`, `.typeCount`) without mounting a plugin.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
endpoint gets a **GraphQL** panel (under Infra): a mini **query playground**
(query + variables + Run, rendering the JSON result), an **SDL viewer**, and a
**recent-ops** table (operation, status, ms, errors). Registered by importing
`@youneed/server-plugin-graphql/devtools` into the devtools web bundle.

## Install

```sh
pnpm add @youneed/server-plugin-graphql graphql
```

`graphql` (`^16.9.0`) is a runtime dependency — install it alongside the plugin.
