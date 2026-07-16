# @youneed/server-plugin-jsonrpc

JSON-RPC 2.0 for `@youneed/server`. Endpoints are classes on **standard TC39
decorators** (like `Controller`), served over a plain **POST** request or a
Chrome-CDP-style **WebSocket**. Ships a `@youneed/server-plugin-devtools` panel
to browse methods (typed from the schemas) and debug calls live.

## Endpoint

```ts
import { JsonRPC, JsonRPCResponse, JsonRPCErrorResponse } from "@youneed/server-plugin-jsonrpc";
import { t } from "@youneed/schema";
import type { Context } from "@youneed/server";

class MathEndpoint extends JsonRPC({
  providers: [loggerProvider(), anotherProvider()], // add private `this.<member>`
  guards: [authRequired()],                         // run before every method
}) {
  @JsonRPC.method("sum", { args: [t.number(), t.number()] })
  sum(a: number, b: number, ctx?: Context) {        // ctx optional, always last
    if (a > 10) return JsonRPCResponse.error({ code: -32000, message: "something went wrong" });
    // return JsonRPCResponse.error(JsonRPCErrorResponse.InternalError); // predefined map
    return JsonRPCResponse.success({ result: a + b });
  }
}
```

A handler may also `return` a plain value — treated as `success(value)`.

## Mount

```ts
import { Application } from "@youneed/server";
import { jsonrpc } from "@youneed/server-plugin-jsonrpc";

Application().plugin(
  jsonrpc((rpc) => ({
    endpoints: [MathEndpoint],
    connection: (s) => s.use("/rpc", rpc.post),   // POST transport
    // connection: (s) => s.ws("/rpc", rpc.ws),    // …or a WebSocket
    // path: "/rpc", exposeDevtools: true,
  })),
);
```

`s.use("/rpc", rpc.post)`, `s.post("/rpc", rpc.post)` and `s.ws("/rpc", rpc.ws)`
all work; omitting `connection` mounts a POST route at `path` (default `/rpc`).

## Wire

```txt
-> {"jsonrpc":"2.0","method":"nope","params":[1,"a"],"id":1}
<- {"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found", ...}}

-> {"jsonrpc":"2.0","method":"sum","params":[1,"a"]}        // no id → generated
<- {"jsonrpc":"2.0","id":"x1-3","error":{"code":-32602,"message":"Invalid params", ...}}
```

The response `id` mirrors the request's; an absent `id` gets a generated one.
Batch (array in → array out) is supported.

## Events (server → client) + per-connection state

Over the **WebSocket** transport a method can push CDP-style EVENT frames
(JSON-RPC notifications — no `id`) back to the calling client, and keep
per-connection scratch state:

```ts
class Feed extends JsonRPC() {
  @JsonRPC.method("subscribe")
  subscribe() {
    this.connection!.state.subscribed = true; // per-connection flag
    this.emit("tick", { n: 1 });              // → {"jsonrpc":"2.0","method":"tick","params":{"n":1}}
    return JsonRPCResponse.success({ ok: true });
  }
}
```

`this.emit` / `this.connection` are no-ops over POST (no push channel). The live
connection is also available ambiently via `rpcConnection()` (mirrors
`context()`), so providers can expose it.

## Self-description (`rpc.discover`)

Every endpoint answers the reserved **`rpc.discover`** method (the OpenRPC
discovery standard) with a machine-readable service document — params/results
rendered to JSON Schema from the `t` schemas:

```txt
-> {"jsonrpc":"2.0","method":"rpc.discover","id":1}
<- {"jsonrpc":"2.0","id":1,"result":{"openrpc":"1.2.6","info":{...},"methods":[
     {"name":"sum","description":"add two numbers",
      "params":[{"name":"arg0","required":true,"schema":{"type":"number"}}, ...],
      "result":{"name":"result","schema":{"type":"number"}}}]}}
```

Declare `returns` / `description` on a method to enrich it:
`@JsonRPC.method("sum", { args:[t.number(), t.number()], returns: t.number(), description: "add two numbers" })`.

## Devtools

```ts
import "@youneed/server-plugin-jsonrpc/devtools"; // in your devtools web bundle
```

Adds a **JSON-RPC** tab to `@youneed/server-plugin-devtools`: the method
catalogue with signatures derived from the `args` schemas, plus a debugger that
POSTs a request envelope and shows the response.
