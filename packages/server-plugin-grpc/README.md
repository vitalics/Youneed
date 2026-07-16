# @youneed/server-plugin-grpc

Run a **gRPC server on the [`@youneed/server`](../server) lifecycle**. gRPC
speaks over its **own HTTP/2 listener** (via [`@grpc/grpc-js`](https://www.npmjs.com/package/@grpc/grpc-js)),
**separate** from the youneed HTTP server — this plugin just ties that gRPC
server's lifetime to your app: it loads your `.proto`s and binds `onListen`,
drains `onShutdown`, and mounts a few youneed HTTP routes that expose the loaded
services, live call stats, and a **unary call-tester** — which powers a devtools
**gRPC** tab.

```ts
import { Application } from "@youneed/server";
import { grpc } from "@youneed/server-plugin-grpc";

const app = Application().plugin(
  grpc({
    protoPath: new URL("./greeter.proto", import.meta.url).pathname,
    package: "greet",
    port: 50051,
    services: {
      // serviceName → { method → handler } (grpc-js unary style)
      Greeter: {
        // (call, callback) — or return a value from an async handler
        SayHello(call, callback) {
          callback(null, { message: `Hello, ${call.request.name}!` });
        },
      },
    },
  }),
);

app.listen(3000); // starts the gRPC server on :50051 too, drains both on shutdown
```

```proto
// greeter.proto
syntax = "proto3";
package greet;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
}
message HelloRequest { string name = 1; }
message HelloReply   { string message = 1; }
```

## The plugin

`grpc(opts)` (alias `createGrpc(opts)`) is a `ServerPlugin`:

- **`onListen`** — loads the protos (`protoLoader.loadSync` +
  `grpc.loadPackageDefinition`), builds a `new grpc.Server()`, `addService` for
  each entry in `services`, `bindAsync(host:port, insecure)` then `start()`
  (guarded — newer grpc-js auto-starts after `bindAsync`).
- **`onShutdown`** — `server.tryShutdown()` (graceful) with a `forceShutdown()`
  fallback and a force-deadline so a hung drain can't block exit.
- Each handler is **wrapped** to count calls + record recent
  `{ method, at, ms, ok, error }` for devtools stats.

### Options

| option           | default       | meaning                                              |
| ---------------- | ------------- | ---------------------------------------------------- |
| `protoPath`      | —             | `.proto` file path(s) to load                        |
| `package`        | —             | restrict lookup/introspection to this proto package  |
| `services`       | —             | `serviceName → { method → handler }`                 |
| `host`           | `"0.0.0.0"`   | bind host                                            |
| `port`           | `50051`       | bind port                                            |
| `loaderOptions`  | sensible set  | merged into `protoLoader.loadSync` options           |
| `credentials`    | insecure      | server credentials                                   |
| `basePath`       | `"/__grpc"`   | HTTP introspection route prefix                      |
| `exposeDevtools` | `true`        | mount the introspection + call routes                |
| `keepRecent`     | `50`          | recent call records kept for devtools                |
| `callTimeoutMs`  | `5000`        | per-`/call` timeout                                  |

`GrpcHandler` is grpc-js unary style — `(call, callback)`. **Unary is supported
at minimum**; streaming handlers use the same signature but drive the `call`
stream directly (future work / advanced use).

## Introspection routes

Mounted under `basePath` (default `/__grpc`):

- **`GET /services`** → `{ host, port, services }` — the loaded services and
  their methods (`name`, `requestType`, `responseType`, stream flags, `kind`),
  derived from the loaded package definition by the pure `describeServices`.
- **`GET /stats`** → `{ calls, recent }` — total call count + recent call records.
- **`POST /call`** `{ service, method, payload }` → makes a **unary** call to the
  local gRPC server (a cached grpc-js client against `localhost:port`), returns
  the response as JSON. Guarded + timed out. Powers the devtools call-tester.

## `inspect()`

Sync, JSON-safe: `{ kind: "grpc", host, port, services, calls, endpoints }` —
`@youneed/server-plugin-devtools` detects the server by `kind === "grpc"`.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
gRPC server gets a **gRPC** panel (under Infra): a **service/method tree**, a
**call-count + recent-calls** table, and a **unary call tester** (pick a
service + method, enter a JSON payload, **Run** → the response/error renders
below). Registered by importing `@youneed/server-plugin-grpc/devtools` into the
devtools web bundle.

## Backends

The gRPC server is [`@grpc/grpc-js`](https://www.npmjs.com/package/@grpc/grpc-js)
(pure-JS HTTP/2) — no native addon. Protos are parsed with
[`@grpc/proto-loader`](https://www.npmjs.com/package/@grpc/proto-loader).
