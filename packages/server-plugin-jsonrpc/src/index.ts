// ── @youneed/server-plugin-jsonrpc — JSON-RPC 2.0 for @youneed/server ─────────
//
// Endpoints are classes (à la `Controller`) built on STANDARD TC39 decorators:
//
//   class MathEndpoint extends JsonRPC({ providers: [loggerProvider()], guards: [authRequired()] }) {
//     @JsonRPC.method("sum", { args: [t.number(), t.number()] })
//     sum(a: number, b: number, ctx?: Context) {
//       if (a > 10) return JsonRPCResponse.error({ code: -32000, message: "too big" });
//       return JsonRPCResponse.success({ result: a + b });
//     }
//   }
//
//   Application().plugin(jsonrpc((rpc) => ({
//     endpoints: [MathEndpoint],
//     connection: (s) => s.use("/rpc", rpc.post),   // POST transport (default path /rpc)
//     // connection: (s) => s.ws("/rpc", rpc.ws),    // …or a Chrome-CDP-style WebSocket
//   })));
//
// HOW the metadata is collected: like the rest of @youneed/*, the `@JsonRPC.method`
// decorator registers through `addInitializer` into a constructor-keyed WeakMap
// (esbuild/tsx never fill `Symbol.metadata` for field/method decorators), so the
// method table lands the first time each endpoint is constructed.

import { AsyncLocalStorage } from "node:async_hooks";
import { context, Response, type AppBuilder, type Context, type ControllerProvider, type Guard, type Middleware, type ServerPlugin, type WsHandlers } from "@youneed/server";
import { rawBody } from "@youneed/server";
import type { Schema } from "@youneed/schema";

// ── JSON-RPC 2.0 wire types ───────────────────────────────────────────────────

/** A JSON-RPC 2.0 request envelope (positional `params` only). */
export interface JsonRpcRequest<Method extends string = string, Params extends unknown[] = unknown[]> {
  jsonrpc: "2.0";
  method: Method;
  params?: Params;
  id?: number | string | null;
}

/** The `error` member of a JSON-RPC 2.0 error response. */
export interface JsonRpcError {
  code: number;
  message: string;
  /** Optional human-friendly elaboration (surfaced in devtools / logs). */
  details?: string;
  /** Optional machine-readable payload (per the spec's `data`). */
  data?: unknown;
}

/** A JSON-RPC 2.0 response envelope — exactly one of `result` / `error`. */
export type JsonRpcResponseEnvelope<Result = unknown> =
  | { jsonrpc: "2.0"; id: number | string | null; result: Result }
  | { jsonrpc: "2.0"; id: number | string | null; error: JsonRpcError };

// ── predefined errors (the standard JSON-RPC 2.0 codes) ───────────────────────

/**
 * The reserved JSON-RPC 2.0 errors, ready to hand to {@link JsonRPCResponse.error}:
 *
 *   return JsonRPCResponse.error(JsonRPCErrorResponse.InternalError);
 */
export const JsonRPCErrorResponse = {
  ParseError: {
    code: -32700,
    message: "Parse error",
    details: "Invalid JSON was received by the server.",
  },
  InvalidRequest: {
    code: -32600,
    message: "Invalid Request",
    details: "The JSON sent is not a valid Request object.",
  },
  MethodNotFound: {
    code: -32601,
    message: "Method not found",
    details: "The method does not exist / is not available.",
  },
  InvalidParams: {
    code: -32602,
    message: "Invalid params",
    details: "Invalid method parameter(s).",
  },
  InternalError: {
    code: -32603,
    message: "Internal error",
    details: "Internal JSON-RPC error.",
  },
  ServerError: {
    code: -32000,
    message: "Server error",
    details: "Reserved for implementation-defined server-errors.",
  },
} as const satisfies Record<string, JsonRpcError>;

// ── handler result wrapper ────────────────────────────────────────────────────

/**
 * The value a `@JsonRPC.method` handler returns. Either:
 *   - `JsonRPCResponse.success(result)` — the `result` member, or
 *   - `JsonRPCResponse.error({ code, message })` — the `error` member.
 * A handler may also return a *plain* value, treated as `success(value)`.
 */
export class JsonRPCResponse<T = unknown> {
  private constructor(
    /** @internal */ readonly ok: boolean,
    /** @internal */ readonly payload: T | JsonRpcError,
  ) {}

  /** Resolve with the `result` member. */
  static success<T>(result: T): JsonRPCResponse<T> {
    return new JsonRPCResponse<T>(true, result);
  }

  /** Reject with the `error` member — a `{ code, message, details? }` object or a
   *  predefined {@link JsonRPCErrorResponse} entry. */
  static error(error: JsonRpcError): JsonRPCResponse<never> {
    return new JsonRPCResponse<never>(false, normalizeError(error));
  }
}

function normalizeError(e: JsonRpcError): JsonRpcError {
  return e.details === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, details: e.details };
}

// ── method registry (constructor-keyed, filled via addInitializer) ────────────

interface MethodMeta {
  /** The public JSON-RPC method name. */
  name: string;
  /** The class method that implements it. */
  handlerName: string;
  /** Positional argument schemas (the `t.*` functional schemas). */
  argSchemas: Schema<unknown>[];
  /** Result schema — used only for self-description (`rpc.discover`). */
  returns?: Schema<unknown>;
  /** Human description — surfaced in `rpc.discover` + devtools. */
  description?: string;
}

const methodRegistry = new WeakMap<Function, Map<string, MethodMeta>>();

function registerMethod(ctor: Function, meta: MethodMeta): void {
  let map = methodRegistry.get(ctor);
  if (!map) methodRegistry.set(ctor, (map = new Map()));
  map.set(meta.handlerName, meta);
}

function getMethods(ctor: Function): MethodMeta[] {
  // Walk the prototype chain so a subclass inherits a base endpoint's methods.
  const out = new Map<string, MethodMeta>();
  for (let c: Function | null = ctor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    const map = methodRegistry.get(c);
    if (map) for (const m of map.values()) if (!out.has(m.handlerName)) out.set(m.handlerName, m);
  }
  return [...out.values()];
}

// ── the `@JsonRPC.method` decorator ───────────────────────────────────────────

/** Options for {@link JsonRPC.method}. */
export interface JsonRpcMethodOptions {
  /** Positional argument schemas, validated (in order) before the handler runs.
   *  A param that fails → an `Invalid params` (-32602) response. */
  args?: Schema<unknown>[];
  /** Result schema — purely for self-description (`rpc.discover` / OpenRPC). */
  returns?: Schema<unknown>;
  /** Human description — surfaced in `rpc.discover` + devtools. */
  description?: string;
}

function methodDecorator(name: string, opts: JsonRpcMethodOptions = {}) {
  return function (_target: unknown, ctx: ClassMethodDecoratorContext): void {
    if (ctx.kind !== "method") throw new Error("@JsonRPC.method can only decorate a method");
    ctx.addInitializer(function (this: unknown) {
      registerMethod((this as object).constructor, {
        name,
        handlerName: ctx.name as string,
        argSchemas: opts.args ?? [],
        returns: opts.returns,
        description: opts.description,
      });
    });
  };
}

// ── the JsonRPC base class factory (mirrors `Controller`) ─────────────────────

/** Config for {@link JsonRPC}: instance providers + endpoint-wide guards. */
export interface JsonRpcConfig<TProviders extends readonly ControllerProvider[] = readonly ControllerProvider[]> {
  /** Providers installed once on the endpoint instance (add private `this.<member>`). */
  providers?: TProviders;
  /** Guards run before EVERY method of the endpoint (a denial → -32000). */
  guards?: Guard[];
}

// Fold a list of provider contributions into a single intersection (as Controller does).
type ContribOf<P> = P extends ControllerProvider<infer C> ? C : {};
type ProviderContributions<P extends readonly ControllerProvider[]> = P extends readonly []
  ? {}
  : P extends readonly [infer H, ...infer T extends readonly ControllerProvider[]]
    ? ContribOf<H> & ProviderContributions<T>
    : {};

// ── live WS connection (server→client events) ─────────────────────────────────

/**
 * A live JSON-RPC WebSocket connection. Lets a method push server-initiated
 * EVENT frames (JSON-RPC notifications — `{ jsonrpc, method, params }`, no `id`)
 * back to THIS client (CDP-style), and carries per-connection scratch state
 * (e.g. which event streams a client has `enable`d).
 */
export interface RpcConnection {
  /** Stable connection id — doubles as the default CDP-style sessionId. */
  readonly id: string;
  /** Push an event frame (a JSON-RPC notification, no `id`) to this client. */
  emit(method: string, params?: unknown): void;
  /** Per-connection scratch, survives across frames (e.g. enabled domains). */
  readonly state: Record<string, unknown>;
  /** Close the socket. */
  close(): void;
}

const connectionStorage = new AsyncLocalStorage<RpcConnection | undefined>();

/** The live WS connection handling the current frame, or `undefined` over the
 *  POST transport / outside a dispatch. Mirrors `context()` from @youneed/server. */
export function rpcConnection(): RpcConnection | undefined {
  return connectionStorage.getStore();
}

interface SocketLike {
  send(data: string | Buffer): void;
  close(code?: number): void;
}

class WsRpcConnection implements RpcConnection {
  readonly state: Record<string, unknown> = {};
  #socket: SocketLike;
  constructor(
    readonly id: string,
    socket: SocketLike,
  ) {
    this.#socket = socket;
  }
  emit(method: string, params?: unknown): void {
    this.#socket.send(JSON.stringify(params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params }));
  }
  close(): void {
    this.#socket.close();
  }
}

class JsonRpcEndpointInternal {
  static providers: ControllerProvider[] = [];
  static guards: Guard[] = [];

  /** The in-flight request context (POST transport) via async-local storage;
   *  `undefined` over the WS transport or outside a request. */
  get ctx(): Context | undefined {
    return context();
  }

  /** The live WS connection (WebSocket transport), or `undefined` over POST. Use
   *  it (or {@link emit}) to push server-initiated event frames to this client. */
  get connection(): RpcConnection | undefined {
    return rpcConnection();
  }

  /** Push a JSON-RPC EVENT (notification) to the current WS client — a no-op when
   *  there's no live connection (e.g. the POST transport). */
  emit(method: string, params?: unknown): void {
    rpcConnection()?.emit(method, params);
  }
}

type JsonRpcEndpointClass = typeof JsonRpcEndpointInternal;

/**
 * Base class for a JSON-RPC endpoint. Methods are exposed with `@JsonRPC.method`.
 * `providers` extend the instance with private members (`this.<member>`), exactly
 * like a `Controller`'s providers; `guards` gate every method.
 */
function JsonRPC<const TProviders extends readonly ControllerProvider[] = readonly []>(
  config: JsonRpcConfig<TProviders> = {},
) {
  class ScopedEndpoint extends JsonRpcEndpointInternal {
    static override providers = (config.providers ?? []) as unknown as ControllerProvider[];
    static override guards = config.guards ?? [];
  }
  // Fold each provider's contribution into the INSTANCE type, so `this.<member>`
  // is typed inside the subclass — no providers ⇒ `{}` (a no-op).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ScopedEndpoint as typeof ScopedEndpoint & (abstract new (...args: any[]) => ProviderContributions<TProviders>);
}

JsonRPC.method = methodDecorator;

export { JsonRPC };

// ── dispatcher ────────────────────────────────────────────────────────────────

interface CompiledMethod {
  name: string;
  invoke: (...args: unknown[]) => unknown;
  argSchemas: Schema<unknown>[];
  returns?: Schema<unknown>;
  description?: string;
  guards: Guard[];
}

/** A method as surfaced for tooling (devtools). */
export interface JsonRpcMethodInfo {
  name: string;
  params: { name: string; type: string }[];
  description?: string;
}

/** Reserved self-description method (OpenRPC's standard discovery name). */
const DISCOVER = "rpc.discover";

class Dispatcher {
  #methods = new Map<string, CompiledMethod>();

  constructor(endpoints: JsonRpcEndpointClass[]) {
    for (const Endpoint of endpoints) {
      const instance = new (Endpoint as new () => object)();
      for (const p of Endpoint.providers ?? []) p.install(instance);
      const guards = Endpoint.guards ?? [];
      for (const meta of getMethods(Endpoint)) {
        if (this.#methods.has(meta.name)) {
          throw new Error(`jsonrpc: duplicate method "${meta.name}"`);
        }
        const fn = (instance as Record<string, (...a: unknown[]) => unknown>)[meta.handlerName];
        this.#methods.set(meta.name, {
          name: meta.name,
          invoke: fn.bind(instance),
          argSchemas: meta.argSchemas,
          returns: meta.returns,
          description: meta.description,
          guards,
        });
      }
    }
  }

  /** The registered methods + their param types (from the schemas) — for devtools. */
  describe(): JsonRpcMethodInfo[] {
    return [...this.#methods.values()].map((m) => ({
      name: m.name,
      params: m.argSchemas.map((s, i) => ({ name: `arg${i}`, type: s.kind })),
      ...(m.description ? { description: m.description } : {}),
    }));
  }

  /** The OpenRPC 1.2 service-description document (self-description), returned by
   *  the reserved `rpc.discover` method — params/results rendered to JSON Schema. */
  openrpc(): Record<string, unknown> {
    return {
      openrpc: "1.2.6",
      info: { title: "youneed JSON-RPC", version: "0.1.0" },
      methods: [...this.#methods.values()].map((m) => ({
        name: m.name,
        ...(m.description ? { description: m.description } : {}),
        params: m.argSchemas.map((s, i) => ({
          name: `arg${i}`,
          required: !s.isOptional && !s.hasDefault,
          schema: schemaToJson(s),
        })),
        ...(m.returns ? { result: { name: "result", schema: schemaToJson(m.returns) } } : {}),
      })),
    };
  }

  /** Dispatch a parsed request body (single object or a batch array), inside the
   *  WS connection's async-local scope (so handlers can `emit` events). Returns the
   *  response envelope(s), or `null` when there is nothing to send. */
  async dispatch(
    body: unknown,
    ctx: Context | undefined,
    genId: () => number | string,
    connection?: RpcConnection,
  ): Promise<unknown> {
    return connectionStorage.run(connection, () => this.#dispatch(body, ctx, genId));
  }

  async #dispatch(body: unknown, ctx: Context | undefined, genId: () => number | string): Promise<unknown> {
    if (Array.isArray(body)) {
      if (body.length === 0) return errorEnvelope(genId(), JsonRPCErrorResponse.InvalidRequest);
      return Promise.all(body.map((r) => this.#one(r, ctx, genId)));
    }
    return this.#one(body, ctx, genId);
  }

  async #one(req: unknown, ctx: Context | undefined, genId: () => number | string): Promise<JsonRpcResponseEnvelope> {
    if (!isObject(req)) return errorEnvelope(genId(), JsonRPCErrorResponse.ParseError);
    const r = req as Record<string, unknown>;
    // The response id mirrors the request's; absent ⇒ generated (this framework
    // always replies, even to id-less requests).
    const id = (r.id === undefined ? genId() : r.id) as number | string | null;

    if (r.jsonrpc !== "2.0" || typeof r.method !== "string") {
      return errorEnvelope(id, JsonRPCErrorResponse.InvalidRequest);
    }

    // Reserved self-description method — always available, never user-overridable.
    if (r.method === DISCOVER) return { jsonrpc: "2.0", id, result: this.openrpc() };

    const m = this.#methods.get(r.method);
    if (!m) return errorEnvelope(id, JsonRPCErrorResponse.MethodNotFound);

    // Only positional params are supported.
    const rawParams = r.params === undefined ? [] : r.params;
    if (!Array.isArray(rawParams)) return errorEnvelope(id, JsonRPCErrorResponse.InvalidParams);

    // Validate each declared argument against its schema.
    const args: unknown[] = [];
    for (let i = 0; i < m.argSchemas.length; i++) {
      const res = m.argSchemas[i].parse(rawParams[i]);
      if (!res.success) return errorEnvelope(id, JsonRPCErrorResponse.InvalidParams);
      args.push(res.value);
    }
    // Untyped endpoints (no `args`) get the raw params passed through.
    const callArgs = m.argSchemas.length ? args : rawParams;

    // Endpoint guards (pre-gate). A denial → a server error envelope.
    for (const g of m.guards) {
      try {
        if ((await g(ctx as Context)) === false) return errorEnvelope(id, JsonRPCErrorResponse.ServerError);
      } catch (e) {
        return errorEnvelope(id, fromException(e));
      }
    }

    // Invoke — context is always passed as the trailing arg (handlers may ignore it).
    let result: unknown;
    try {
      result = await m.invoke(...callArgs, ctx);
    } catch (e) {
      return errorEnvelope(id, fromException(e));
    }

    if (result instanceof JsonRPCResponse) {
      return result.ok
        ? { jsonrpc: "2.0", id, result: result.payload }
        : { jsonrpc: "2.0", id, error: result.payload as JsonRpcError };
    }
    return { jsonrpc: "2.0", id, result };
  }
}

function errorEnvelope(id: number | string | null, error: JsonRpcError): JsonRpcResponseEnvelope {
  return { jsonrpc: "2.0", id, error: normalizeError(error) };
}

function fromException(e: unknown): JsonRpcError {
  return { ...JsonRPCErrorResponse.InternalError, details: e instanceof Error ? e.message : String(e) };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Render a `t.*` schema to a (minimal) JSON Schema for `rpc.discover`. Only the
 *  publicly-exposed shape (kind/optional/default/description) is available. */
function schemaToJson(s: Schema<unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  switch (s.kind) {
    case "number":
      out.type = "number";
      break;
    case "int":
    case "port":
      out.type = "integer";
      break;
    case "boolean":
      out.type = "boolean";
      break;
    case "url":
      out.type = "string";
      out.format = "uri";
      break;
    case "json":
      break; // any
    default:
      out.type = "string"; // string / enum
  }
  if (s.description) out.description = s.description;
  if (s.hasDefault) out.default = s.defaultValue;
  return out;
}

// ── the server plugin ─────────────────────────────────────────────────────────

/** Brand stamped on the POST transport so the connection helper can recognise it
 *  and mount it as a real route (scoped middleware needs a matching route to fire). */
const POST_TRANSPORT = Symbol("jsonrpc.post");

/** The transport connectors handed to the `connection` callback. */
export interface JsonRpcConnectors {
  /** POST transport — wire with `s.use("/rpc", rpc.post)` or `s.post("/rpc", rpc.post)`. */
  post: Middleware;
  /** WebSocket transport (Chrome-CDP-style) — wire with `s.ws("/rpc", rpc.ws)`. */
  ws: WsHandlers;
}

/** Options returned by the {@link jsonrpc} config callback. */
export interface JsonRpcPluginOptions {
  /** The endpoint classes to expose (each extends {@link JsonRPC}). */
  endpoints: JsonRpcEndpointClass[];
  /** Wire the transport onto the app. Receives the app builder; use the `rpc`
   *  connectors from the callback argument. Defaults to a POST route at `path`. */
  connection?: (app: AppBuilder) => unknown;
  /** Default mount path used when `connection` mounts the POST transport without
   *  a path, or when `connection` is omitted. Default `/rpc`. */
  path?: string;
  /** Expose the devtools `inspect()` info (method catalogue). Default `true`. */
  exposeDevtools?: boolean;
}

/** A JSON-RPC `ServerPlugin` (carries `inspect()` for devtools). */
export interface JsonRpcPlugin extends ServerPlugin {
  /** The compiled method catalogue (also surfaced via `inspect()`). */
  methods(): JsonRpcMethodInfo[];
}

let wsIdSeq = 0;

/**
 * Build the JSON-RPC server plugin. The config callback receives the {@link
 * JsonRpcConnectors} (`rpc.post` / `rpc.ws`) and returns the endpoints + the
 * `connection` wiring:
 *
 *   app.plugin(jsonrpc((rpc) => ({
 *     endpoints: [MathEndpoint],
 *     connection: (s) => s.use("/rpc", rpc.post),
 *   })));
 */
export function jsonrpc(configure: (rpc: JsonRpcConnectors) => JsonRpcPluginOptions): JsonRpcPlugin {
  // The dispatcher is built AFTER the config returns its endpoints, so the
  // connectors close over a lazily-filled holder (the config references `rpc`
  // while it's still defining the endpoints — a chicken/egg the holder breaks).
  let dispatcher: Dispatcher | undefined;
  const state = { path: "/rpc", transport: "post" as "post" | "ws" };

  const dispatch = (
    body: unknown,
    ctx: Context | undefined,
    genId: () => number | string,
    connection?: RpcConnection,
  ): Promise<unknown> => {
    if (!dispatcher) throw new Error("jsonrpc: dispatcher not ready");
    return dispatcher.dispatch(body, ctx, genId, connection);
  };

  const post = (async (ctx: Context, next?: () => unknown) => {
    // Hybrid: as a global middleware, only claim POSTs to the mount path.
    if (typeof next === "function") {
      const path = pathOf(ctx.request.url);
      if ((ctx.request.method ?? "GET").toUpperCase() !== "POST" || path !== state.path) return next();
    }
    let body = ctx.body;
    if (body === undefined) {
      // Global-middleware path: the router hasn't drained the body for us.
      try {
        body = JSON.parse((await rawBody(ctx)).toString("utf8"));
      } catch {
        return Response({ status: 200, body: errorEnvelope(ctx.requestId, JsonRPCErrorResponse.ParseError) });
      }
    }
    state.transport = "post";
    const result = await dispatch(body, ctx, () => ctx.requestId);
    return Response({ status: 200, body: result });
  }) as Middleware & { [POST_TRANSPORT]?: true };
  post[POST_TRANSPORT] = true;

  // Per-socket live connections (CDP-style) — created on upgrade, reused per frame,
  // dropped on close. Each carries `emit` (server→client events) + scratch state.
  const conns = new WeakMap<object, WsRpcConnection>();
  const connOf = (socket: SocketLike): WsRpcConnection => {
    let c = conns.get(socket as object);
    if (!c) conns.set(socket as object, (c = new WsRpcConnection(`rpc-${++wsIdSeq}`, socket)));
    return c;
  };

  const ws: WsHandlers = {
    open(socket) {
      connOf(socket);
    },
    async message(socket, message) {
      state.transport = "ws";
      const conn = connOf(socket);
      let body: unknown;
      try {
        body = JSON.parse(message);
      } catch {
        socket.send(JSON.stringify(errorEnvelope(null, JsonRPCErrorResponse.ParseError)));
        return;
      }
      const result = await dispatch(body, undefined, () => `${conn.id}.${++wsIdSeq}`, conn);
      if (result != null) socket.send(JSON.stringify(result));
    },
    close(socket) {
      conns.delete(socket as object);
    },
  };

  const connectors: JsonRpcConnectors = { post, ws };
  const opts = configure(connectors);
  state.path = normalize(opts.path ?? "/rpc");
  dispatcher = new Dispatcher(opts.endpoints);

  // A connection wrapper: honours `s.use("/rpc", rpc.post)` by mounting a REAL
  // POST route (scoped middleware alone never fires without one), while letting
  // every other app call (incl. `s.ws`) pass straight through.
  const wrap = (app: AppBuilder): AppBuilder =>
    new Proxy(app, {
      get(target, prop, recv) {
        if (prop === "use") {
          return (pathOrMw: unknown, ...rest: unknown[]) => {
            const all = [pathOrMw, ...rest];
            const isPost = all.some((a) => a && (a as { [POST_TRANSPORT]?: true })[POST_TRANSPORT]);
            if (isPost) {
              const p = typeof pathOrMw === "string" ? normalize(pathOrMw) : state.path;
              state.path = p;
              app.post(p, post as unknown as (ctx: Context) => unknown);
              return recv;
            }
            (app.use as (...a: unknown[]) => unknown)(pathOrMw, ...rest);
            return recv;
          };
        }
        if (prop === "post") {
          return (p: string, handler: unknown, schema?: unknown) => {
            if (handler && (handler as { [POST_TRANSPORT]?: true })[POST_TRANSPORT]) state.path = normalize(p);
            (app.post as (...a: unknown[]) => unknown)(p, handler, schema);
            return recv;
          };
        }
        if (prop === "ws") {
          return (p: string, handlers: unknown) => {
            state.transport = "ws";
            state.path = normalize(p);
            (app.ws as (...a: unknown[]) => unknown)(p, handlers);
            return recv;
          };
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    }) as AppBuilder;

  return {
    name: "jsonrpc",
    setup(app) {
      if (opts.connection) {
        opts.connection(wrap(app));
      } else {
        // No connection given → default POST route at `path`.
        app.post(state.path, post as unknown as (ctx: Context) => unknown);
      }
    },
    methods() {
      return dispatcher!.describe();
    },
    inspect() {
      if (opts.exposeDevtools === false) return undefined;
      return { kind: "jsonrpc", transport: state.transport, path: state.path, methods: dispatcher!.describe() };
    },
  };
}

function pathOf(url: string | undefined): string {
  const u = url ?? "/";
  const q = u.indexOf("?");
  return normalize(q === -1 ? u : u.slice(0, q));
}

function normalize(p: string): string {
  if (!p.startsWith("/")) p = "/" + p;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
