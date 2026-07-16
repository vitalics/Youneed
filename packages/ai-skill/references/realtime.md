# Realtime — WebSocket / SSE / Pub-Sub / JSON-RPC

Bidirectional and streaming transports for `@youneed/server`. Core ships raw
WS + SSE; pub/sub and JSON-RPC are plugins. See `./server.md` for routing,
`./plugins-infra.md` for the plugin system, `./auth.md` for guarding connections.

## WebSocket (core)

`app.ws(path, handlers)` — hand-rolled RFC 6455 (text/binary frames, ping→pong,
close). Source: `packages/server/src/server.ts` (`WsConnection`, `WsHandlers`).

```ts
import { Application, t } from "@youneed/server";

Application()
  .ws("/chat", {
    open(ws) { ws.send("welcome"); },
    message(ws, msg) { ws.send("echo:" + msg); },   // string for text frames, Buffer for binary
    close(ws) { /* cleanup */ },
    schema: { message: t.string(), response: t.string() }, // → AsyncAPI
  })
  .listen(3000, () => {});
```

`WsHandlers`:

```ts
interface WsHandlers {
  open?(ws): void;
  message?(ws, message: string): unknown | AsyncIterable<unknown>; // generator → streamed back
  close?(ws): void;
  schema?: { message?: Schema; response?: Schema };
}
```

The `ws` object: `.send(string | Buffer)`, `.close(code = 1000)`, `.readyState`
(1 open / 3 closed), and it's an `EventEmitter` (`"message"`, `"close"`). `message`
may return an **async generator** — each yielded value is sent as a frame.

## Server-Sent Events (core)

`app.sse(path, handlers)` — a one-directional `text/event-stream`. Modeled like
`.ws`; registers a hidden GET that takes over the socket (shows up in AsyncAPI, not
OpenAPI).

```ts
Application()
  .sse("/notes", {
    // generator form: yielded events are streamed, then the stream closes
    async *open(conn) {
      yield { event: "tick", id: "1", data: { n: 1 } };
      yield "plain string is sent as data:";
    },
    close(conn) {},
    schema: { event: t.object({ n: t.number() }) },
  })
  .listen(3000, () => {});
```

`open` may instead be a plain function that pushes via `conn.send(event | string)`.
`SseConnection`: `.send(SseEvent | string)`, `.closed`. `SseEvent = { data, event?,
id?, retry? }` — `data` string sent as-is, else `JSON.stringify`'d.

## Pub/Sub — `@youneed/server-plugin-pubsub`

Backend-agnostic publish/subscribe; you code against the `PubSub` contract
(messages are **strings** — you serialize) and pick a transport. `pubsub(bus)` is a
`ServerPlugin` (mounts introspection routes, surfaces a devtools Pub/Sub node).

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";

const bus = createPubSub();                 // default = in-process MemoryPubSub
const app = Application().plugin(pubsub(bus)).listen(3000, () => {});

// handler is (message, channel); messages are strings → serialize
const sub = await bus.subscribe("orders", (message, channel) => {
  const order = JSON.parse(message);
  console.log(`[${channel}]`, order.id);
});
await bus.publish("orders", JSON.stringify({ id: 42 }));
await sub.close();                          // stop delivery
```

`PubSub` contract:

```ts
interface PubSub {
  readonly name?: string;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: Subscriber): Promise<Subscription>;
  close?(): Promise<void>;
}
type Subscriber = (message: string, channel: string) => void | Promise<void>;
```

- **`createPubSub(backend?, opts?)`** → `TrackedPubSub` (wraps any backend for
  devtools; `opts.recent` = per-channel ring buffer, default 25). Pass the **same**
  instance to `pubsub(...)` and your handlers so all traffic is tracked.
- **`MemoryPubSub`** — in-process, single instance / dev.
- **`pubsub(bus, opts?)`** → `ServerPlugin`. Mounts `GET /__pubsub/channels` +
  `POST /__pubsub/publish` (`basePath` default `"/__pubsub"`, `exposeDevtools` default `true`).

### Choosing a transport (adapters)

Each implements the `PubSub` contract; wrap it with `createPubSub(adapter)`:

| Adapter | import | mechanism | pick when |
| --- | --- | --- | --- |
| (none) | `MemoryPubSub` (built-in) | in-process | single instance / dev |
| **redis** | `@youneed/server-plugin-pubsub-redis` → `RedisPubSub` | RESP `SUBSCRIBE`/`PUBLISH` over `node:net` | general multi-instance broadcast |
| **postgres** | `@youneed/server-plugin-pubsub-postgres` → `postgresPubSub` | `LISTEN`/`NOTIFY` (peer dep `pg`) | already on Postgres, no extra infra |
| **kafka** | `@youneed/server-plugin-pubsub-kafka` → `kafkaPubSub` | Kafka topics, unique `groupId` per sub (peer dep `kafkajs`) | high-throughput event log / streaming |
| **deno** | `@youneed/server-plugin-pubsub-deno` → `denoPubSub` | Deno KV queues | Deno / Deno Deploy |
| **rabbitmq** | `@youneed/server-plugin-pubsub-rabbitmq` → `rabbitmqPubSub` | AMQP topic exchange, channel = routing key (peer dep `amqplib`) | classic broker, work queues, routing |
| **nats** | `@youneed/server-plugin-pubsub-nats` → `natsPubSub` | NATS subjects (peer dep `nats`) | low-latency cloud-native messaging |
| **sqs** | `@youneed/server-plugin-pubsub-sqs` → `sqsPubSub` | AWS SQS queue-per-channel, long-poll (SigV4, no SDK) | serverless / AWS, durable at-least-once |

```ts
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { postgresPubSub } from "@youneed/server-plugin-pubsub-postgres";

const bus = createPubSub(postgresPubSub({ connectionString: process.env.DATABASE_URL }));
Application().plugin(pubsub(bus)).listen(3000, () => {});
```

Notes: Kafka is **pub/sub only** (pair with a KV adapter for state); each `subscribe`
is a broadcast (own offsets), not a shared work queue. Postgres/Deno adapters also
export `postgresKV`/`DenoKV` for the `@youneed/server-plugin-store` KV side over the
same backend.

### Bridge pub/sub → WS clients

```ts
const bus = createPubSub();
app.ws("/feed", {
  async open(ws) {
    const sub = await bus.subscribe("orders", (msg) => ws.send(msg)); // already a string
    ws.on("close", () => sub.close());
  },
});
// elsewhere: await bus.publish("orders", JSON.stringify(order));
```

## JSON-RPC — `@youneed/server-plugin-jsonrpc`

JSON-RPC 2.0 endpoints as TC39-decorator classes (like `Controller`), over **POST**
or a CDP-style **WebSocket**. Batch supported; reserved `rpc.discover` returns an
OpenRPC document. NOTE: import `t` from `@youneed/schema` here (the server's `t` is a
different builder).

```ts
import { JsonRPC, JsonRPCResponse, jsonrpc } from "@youneed/server-plugin-jsonrpc";
import { t } from "@youneed/schema";
import { Application } from "@youneed/server";

class MathEndpoint extends JsonRPC({ guards: [/* authRequired() */] }) {
  @JsonRPC.method("sum", { args: [t.number(), t.number()], returns: t.number() })
  sum(a: number, b: number, ctx?) {          // ctx optional, always last
    return JsonRPCResponse.success({ result: a + b }); // or a plain value
  }
}

Application().plugin(
  jsonrpc((rpc) => ({
    endpoints: [MathEndpoint],
    connection: (s) => s.use("/rpc", rpc.post),  // POST; or s.ws("/rpc", rpc.ws)
    // path: "/rpc", exposeDevtools: true,        // omit connection → POST at `path`
  })),
).listen(3000, () => {});
```

Over **WS** a method can push server→client EVENT frames (notifications, no `id`)
via `this.emit("tick", { n: 1 })` and keep `this.connection!.state` per connection;
both are no-ops over POST. Ambient `rpcConnection()` mirrors `context()`.
