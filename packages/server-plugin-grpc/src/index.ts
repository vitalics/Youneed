// ── @youneed/server-plugin-grpc — a gRPC server on the @youneed lifecycle ─────
//
// gRPC speaks over its OWN HTTP/2 server (via `@grpc/grpc-js`), which is a
// SEPARATE listener from the `@youneed/server` HTTP server. This plugin ties
// that gRPC server's lifetime to the youneed app:
//
//   • `onListen`  → load protos, build `new grpc.Server()`, add your services,
//                   `bindAsync(host:port)` + `start()`.
//   • `onShutdown`→ `tryShutdown()` (graceful) with a `forceShutdown()` fallback.
//
// It also mounts a few youneed HTTP routes (default under `/__grpc`) that expose
// the loaded services, live call stats, and a UNARY call-tester — which powers a
// devtools **gRPC** tab (service/method tree, stats table, call runner).
//
// Runtime deps: `@grpc/grpc-js` (^1.12.0) + `@grpc/proto-loader` (^0.7.13). They
// are loaded lazily (dynamic import) inside the lifecycle so the pure helpers in
// `./introspect` stay importable without them.

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";
import {
  CallStats,
  describeServices,
  type GrpcServiceInfo,
  type CallStatsSnapshot,
  type PackageDefinition,
} from "./introspect.ts";

export * from "./introspect.ts"; // describeServices, CallStats, introspection types

// ── minimal structural types for grpc-js / proto-loader ───────────────────────
// (declared locally so `tsc` doesn't require the packages' own d.ts to be
//  installed; the real modules match these shapes at runtime.)

/** grpc-js unary handler args. `callback` is the grpc-js unary responder. */
export interface GrpcCall<Req = any> {
  request: Req;
  metadata?: unknown;
}
export type GrpcCallback<Res = any> = (err: unknown, value?: Res) => void;

/**
 * A gRPC method handler, grpc-js unary style: `(call, callback)`. Return-style
 * (async → resolved value passed to `callback`) is also supported by the
 * wrapper. Streaming handlers use the same signature but drive the `call`
 * stream directly — **unary is supported at minimum; streaming is future work.**
 */
export type GrpcHandler<Req = any, Res = any> = (call: GrpcCall<Req>, callback: GrpcCallback<Res>) => void | Promise<Res | void>;

/** A service's implementation: `methodName → handler`. */
export type GrpcServiceImpl = Record<string, GrpcHandler>;

/** All services: `serviceName → { method → handler }`. */
export type GrpcServiceMap = Record<string, GrpcServiceImpl>;

type ProtoLoaderModule = {
  loadSync(filename: string | string[], options?: Record<string, unknown>): PackageDefinition;
};
interface GrpcServerLike {
  addService(def: unknown, impl: Record<string, unknown>): void;
  bindAsync(addr: string, creds: unknown, cb: (err: Error | null, port: number) => void): void;
  start?(): void;
  tryShutdown(cb: (err?: Error) => void): void;
  forceShutdown(): void;
}
interface GrpcModule {
  Server: new (options?: Record<string, unknown>) => GrpcServerLike;
  ServerCredentials: { createInsecure(): unknown };
  credentials: { createInsecure(): unknown };
  loadPackageDefinition(pkg: PackageDefinition): Record<string, unknown>;
  Client: new (address: string, creds: unknown, options?: Record<string, unknown>) => unknown;
  makeGenericClientConstructor?: (def: unknown, serviceName: string) => new (address: string, creds: unknown) => Record<string, unknown>;
}

// ── options ───────────────────────────────────────────────────────────────────

export interface GrpcOptions {
  /** Path(s) to the `.proto` file(s) to load. */
  protoPath: string | string[];
  /** Restrict introspection/lookup to this proto package (dotted). Optional. */
  package?: string;
  /** Service implementations: `serviceName → { method → handler }`. */
  services: GrpcServiceMap;
  /** Bind host. Default `"0.0.0.0"`. */
  host?: string;
  /** Bind port. Default `50051`. */
  port?: number;
  /** Passed straight to `protoLoader.loadSync`. */
  loaderOptions?: Record<string, unknown>;
  /** Server credentials factory. Default insecure. */
  credentials?: unknown;
  /** Internal route prefix (default `"/__grpc"`). */
  basePath?: string;
  /** Mount the devtools introspection + call routes (default true). */
  exposeDevtools?: boolean;
  /** How many recent call records to keep for devtools (default 50). */
  keepRecent?: number;
  /** Per-`/call` timeout in ms (default 5000). */
  callTimeoutMs?: number;
}

const DEFAULT_LOADER_OPTIONS: Record<string, unknown> = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

/** The `inspect()` payload — devtools detects the gRPC server by `kind === "grpc"`. */
export interface GrpcInspect {
  kind: "grpc";
  host: string;
  port: number;
  services: GrpcServiceInfo[];
  calls: number;
  endpoints: { services: string; stats: string; call: string };
}

// ── plugin ──────────────────────────────────────────────────────────────────

/**
 * Run a gRPC server (its own HTTP/2 listener) on the `@youneed/server`
 * lifecycle. Loads protos + binds `onListen`, drains `onShutdown`, and exposes
 * introspection + a unary call-tester over HTTP for the devtools **gRPC** tab.
 */
export function grpc(opts: GrpcOptions): ServerPlugin & { readonly stats: CallStats } {
  const host = opts.host ?? "0.0.0.0";
  const port = opts.port ?? 50051;
  const basePath = (opts.basePath ?? "/__grpc").replace(/\/$/, "");
  const callTimeoutMs = opts.callTimeoutMs ?? 5000;
  const endpoints = {
    services: `${basePath}/services`,
    stats: `${basePath}/stats`,
    call: `${basePath}/call`,
  };
  const stats = new CallStats({ keep: opts.keepRecent ?? 50 });

  // Populated on listen (needs the grpc modules).
  let grpcMod: GrpcModule | undefined;
  let server: GrpcServerLike | undefined;
  let loadedPackage: Record<string, unknown> | undefined;
  let services: GrpcServiceInfo[] = [];
  // Cached grpc clients per service for the `/call` tester.
  const clients = new Map<string, Record<string, unknown>>();

  /** Wrap each handler so it counts + records into {@link stats}. */
  function instrument(serviceName: string, method: string, handler: GrpcHandler): GrpcHandler {
    return async (call, callback) => {
      const start = Date.now();
      const label = `${serviceName}.${method}`;
      // grpc-js calls the callback; we also support a returned value (async handler).
      let settled = false;
      const done: GrpcCallback = (err, value) => {
        if (settled) return;
        settled = true;
        stats.record(label, start, !err, err ? errMsg(err) : undefined);
        callback(err, value);
      };
      try {
        const ret = await handler(call, done);
        if (!settled && ret !== undefined) done(null, ret as unknown);
      } catch (err) {
        done(err);
      }
    };
  }

  return {
    name: "@youneed/server-plugin-grpc",
    get stats() {
      return stats;
    },

    setup(app) {
      if (opts.exposeDevtools === false) return;

      // GET /services → loaded services + methods (introspection).
      app.get(endpoints.services, () => Response.json({ host, port, services }));

      // GET /stats → { calls, recent }.
      app.get(endpoints.stats, () => Response.json(stats.snapshot() satisfies CallStatsSnapshot));

      // POST /call { service, method, payload } → unary call to the local server.
      app.post(endpoints.call, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { service?: string; method?: string; payload?: unknown };
        if (!body.service || !body.method) return Response.json({ error: "service and method are required" }, { status: 400 });
        if (!grpcMod || !loadedPackage) return Response.json({ error: "gRPC server not started" }, { status: 503 });
        try {
          const response = await callUnary(body.service, body.method, body.payload ?? {});
          return Response.json({ ok: true, response });
        } catch (err) {
          return Response.json({ ok: false, error: errMsg(err) }, { status: 502 });
        }
      });
    },

    async onListen() {
      // Lazily load the grpc modules — a missing dep only fails the gRPC listener,
      // not the youneed HTTP server or the pure helpers.
      const [grpcImport, loaderImport] = await Promise.all([
        import("@grpc/grpc-js") as Promise<GrpcModule | { default: GrpcModule }>,
        import("@grpc/proto-loader") as Promise<ProtoLoaderModule | { default: ProtoLoaderModule }>,
      ]);
      grpcMod = ("default" in grpcImport ? grpcImport.default : grpcImport) as GrpcModule;
      const protoLoader = ("default" in loaderImport ? loaderImport.default : loaderImport) as ProtoLoaderModule;

      const packageDefinition = protoLoader.loadSync(opts.protoPath, { ...DEFAULT_LOADER_OPTIONS, ...opts.loaderOptions });
      loadedPackage = grpcMod.loadPackageDefinition(packageDefinition);
      services = describeServices((opts.package ? pick(loadedPackage, opts.package) : loadedPackage) as PackageDefinition);

      const srv = new grpcMod.Server();
      for (const [serviceName, impl] of Object.entries(opts.services)) {
        const serviceCtor = resolveService(loadedPackage, serviceName, opts.package);
        if (!serviceCtor?.service) throw new Error(`gRPC service "${serviceName}" not found in the loaded proto`);
        const wrapped: Record<string, unknown> = {};
        for (const [method, handler] of Object.entries(impl)) wrapped[method] = instrument(serviceName, method, handler);
        srv.addService(serviceCtor.service, wrapped);
      }

      const creds = opts.credentials ?? grpcMod.ServerCredentials.createInsecure();
      await new Promise<void>((resolve, reject) => {
        srv.bindAsync(`${host}:${port}`, creds, (err) => (err ? reject(err) : resolve()));
      });
      // Newer grpc-js auto-starts after bindAsync; call start() guarded for older.
      srv.start?.();
      server = srv;
    },

    async onShutdown() {
      const srv = server;
      if (!srv) return;
      server = undefined;
      clients.clear();
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        try {
          srv.tryShutdown((err) => {
            if (err) srv.forceShutdown();
            finish();
          });
        } catch {
          srv.forceShutdown();
          finish();
        }
        // Force-deadline: if a graceful drain hangs, force it.
        setTimeout(() => {
          if (!done) {
            try {
              srv.forceShutdown();
            } catch {
              /* ignore */
            }
            finish();
          }
        }, 3000).unref?.();
      });
    },

    inspect(): GrpcInspect {
      // Sync — topology never awaits. `services`/`calls` fill in after onListen;
      // the devtools panel fetches live `/services` + `/stats` over the routes.
      return { kind: "grpc", host, port, services, calls: stats.calls, endpoints };
    },
  };

  // ── local helpers (closure over grpcMod/loadedPackage) ──────────────────────

  /** Make ONE unary call to the local gRPC server and resolve its JSON response. */
  function callUnary(serviceName: string, method: string, payload: unknown): Promise<unknown> {
    const g = grpcMod!;
    const serviceCtor = resolveService(loadedPackage!, serviceName, opts.package);
    if (!serviceCtor) throw new Error(`gRPC service "${serviceName}" not found`);
    let client = clients.get(serviceName);
    if (!client) {
      const address = `localhost:${port}`;
      const insecure = g.credentials.createInsecure();
      // The service constructor from loadPackageDefinition IS a client constructor.
      const Ctor = serviceCtor as unknown as new (address: string, creds: unknown) => Record<string, unknown>;
      client = new Ctor(address, insecure);
      clients.set(serviceName, client);
    }
    const fn = client[method] as ((req: unknown, cb: (err: unknown, res: unknown) => void) => void) | undefined;
    if (typeof fn !== "function") throw new Error(`method "${method}" not found on service "${serviceName}"`);
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`gRPC call timed out after ${callTimeoutMs}ms`)), callTimeoutMs);
      if (typeof timer === "object" && "unref" in timer) (timer as { unref(): void }).unref();
      try {
        fn.call(client, payload, (err: unknown, res: unknown) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve(res);
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}

/** Convenience alias mirroring the sibling packages' `createX`. */
export function createGrpc(opts: GrpcOptions): ServerPlugin & { readonly stats: CallStats } {
  return grpc(opts);
}

// ── module-level helpers ──────────────────────────────────────────────────────

interface ServiceCtorWithDef {
  service?: Record<string, unknown>;
}

/** Descend a dotted package path (e.g. `"pkg.sub"`) in a loaded package object. */
function pick(pkg: Record<string, unknown>, dotted: string): Record<string, unknown> {
  let cur: Record<string, unknown> = pkg;
  for (const seg of dotted.split(".")) {
    const next = cur[seg];
    if (!next || typeof next !== "object") return {};
    cur = next as Record<string, unknown>;
  }
  return cur;
}

/**
 * Find a service constructor by (optionally package-qualified) name in a loaded
 * package. Tries `pkg.Service`, a fully-qualified dotted name, and a bare name.
 */
function resolveService(pkg: Record<string, unknown>, serviceName: string, pkgName?: string): ServiceCtorWithDef | undefined {
  const candidates = pkgName ? [`${pkgName}.${serviceName}`, serviceName] : [serviceName];
  for (const cand of candidates) {
    let cur: unknown = pkg;
    for (const seg of cand.split(".")) {
      if (!cur || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
    const ctor = cur as ServiceCtorWithDef | undefined;
    if (ctor?.service) return ctor;
  }
  return undefined;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
