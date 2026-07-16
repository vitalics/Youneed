# API protocols — GraphQL & gRPC

Two extra protocol endpoints you can bolt onto a `@youneed/server` app alongside its HTTP/REST
routes.

## GraphQL — `@youneed/server-plugin-graphql`

Powered by the reference `graphql-js`. Schema-first (SDL) or a pre-built `GraphQLSchema` +
resolvers → spec-compliant `POST`/`GET` endpoint with in-browser GraphiQL and a devtools tab.

```ts
import { Application } from "@youneed/server";
import { graphql } from "@youneed/server-plugin-graphql";

const app = Application().plugin(graphql({
  schema: /* GraphQL */ `
    type Query { hello: String  add(a: Int, b: Int): Int }
  `,
  rootValue: {
    hello: () => "hi",
    add: ({ a, b }: { a: number; b: number }) => a + b,
  },
  // context: (ctx) => ({ user: ctx.state.user }),   // per-request contextValue
  // path: "/graphql",                                // default
  // graphiql: true,                                  // GraphiQL on GET from a browser
}));
app.listen(3000);
// POST /graphql {"query":"{ hello }"} → {"data":{"hello":"hi"}}
// GET  /graphql (browser)             → GraphiQL IDE
```

- **`graphql(opts)`** is the plugin (graphql-js's own `graphql` execute fn is imported aliased
  as `runGraphQL` internally to avoid the name collision — the export is the plugin).
- **`schema`** — SDL string (built via `buildSchema`) or a `GraphQLSchema`; validated on
  construction.
- **`rootValue` / `resolvers`** — root resolver object (`fieldName → fn`); merged, `rootValue`
  wins. An SDL schema resolves its `Query`/`Mutation` fields against them.
- **`context(ctx)`** — per-request `contextValue` (thread the authenticated user, loaders, …).
- Devtools tab: a mini playground, the SDL, recent operations.

Keep resolvers thin — call the same services your REST controllers use. Auth still runs via
youneed middleware/guards on the endpoint path.

## gRPC — `@youneed/server-plugin-grpc`

gRPC runs over its **own HTTP/2 listener** (via `@grpc/grpc-js`), **separate** from the youneed
HTTP server. The plugin ties that gRPC server's lifetime to the app: loads `.proto`s, binds
`onListen` (start), `onShutdown` (drain), and mounts HTTP routes exposing the loaded services,
call stats, and a unary call-tester → a devtools **gRPC** tab.

```ts
import { Application } from "@youneed/server";
import { grpc } from "@youneed/server-plugin-grpc";

const app = Application().plugin(grpc({
  protoPath: new URL("./greeter.proto", import.meta.url).pathname,
  package: "greet",
  port: 50051,
  services: {
    Greeter: {                                   // serviceName → { method → handler }
      SayHello(call, callback) { callback(null, { message: `Hello, ${call.request.name}!` }); },
    },
  },
}));
app.listen(3000);   // also starts gRPC on :50051; drains both on shutdown
```
```proto
syntax = "proto3";
package greet;
service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }
message HelloRequest { string name = 1; }
message HelloReply   { string message = 1; }
```

Handlers are grpc-js unary style `(call, callback)` (or return a value from an async handler).
The HTTP app and the gRPC listener are separate ports — plan firewall/ingress for both.
