// ── @youneed/server-plugin-grpc/introspect — PURE helpers (no grpc dep) ───────
//
// These two helpers are the deliberately dependency-free core of the plugin so
// they can be unit-tested without `@grpc/grpc-js` / `@grpc/proto-loader` (or a
// live gRPC server) present:
//
//   • `describeServices(packageDefinition)` maps a loaded proto → the JSON
//     introspection shape the `/services` route + devtools tree render from.
//   • `CallStats` counts calls and keeps a bounded ring of recent call records.
//
// The rest of the package (server bind, client call) is intentionally thin glue
// around grpc-js and lives in `index.ts`.

// ── proto-loader shape (structural — no import needed) ────────────────────────

/** A single method entry as `@grpc/proto-loader` emits it on a service. */
export interface ProtoMethodDefinition {
  path?: string;
  originalName?: string;
  requestStream?: boolean;
  responseStream?: boolean;
  requestType?: { type?: { name?: string } };
  responseType?: { type?: { name?: string } };
}

/** A loaded service definition: `methodName → method`. */
export type ProtoServiceDefinition = Record<string, ProtoMethodDefinition>;

/**
 * The result of `grpc.loadPackageDefinition(protoLoader.loadSync(...))` is a
 * (possibly nested) namespace object. Its service entries are constructors that
 * carry a `.service` = {@link ProtoServiceDefinition}; message/enum entries do
 * not. We treat any value with a `.service` as a service.
 */
export interface ServiceConstructorLike {
  service?: ProtoServiceDefinition;
  serviceName?: string;
}

/** The raw thing `protoLoader.loadSync` returns (before `loadPackageDefinition`). */
export type PackageDefinition = Record<string, ProtoServiceDefinition | unknown>;

// ── introspection shape (what the routes + devtools render) ───────────────────

export interface GrpcMethodInfo {
  name: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  /** "unary" | "server-stream" | "client-stream" | "bidi" — convenience label. */
  kind: "unary" | "server-stream" | "client-stream" | "bidi";
}

export interface GrpcServiceInfo {
  name: string;
  methods: GrpcMethodInfo[];
}

function streamKind(reqStream: boolean, resStream: boolean): GrpcMethodInfo["kind"] {
  if (reqStream && resStream) return "bidi";
  if (reqStream) return "client-stream";
  if (resStream) return "server-stream";
  return "unary";
}

/** Map one loaded {@link ProtoServiceDefinition} → its method introspection list. */
export function describeService(def: ProtoServiceDefinition): GrpcMethodInfo[] {
  const methods: GrpcMethodInfo[] = [];
  for (const [name, m] of Object.entries(def)) {
    const requestStream = Boolean(m.requestStream);
    const responseStream = Boolean(m.responseStream);
    methods.push({
      name: m.originalName ?? name,
      requestType: m.requestType?.type?.name ?? "unknown",
      responseType: m.responseType?.type?.name ?? "unknown",
      requestStream,
      responseStream,
      kind: streamKind(requestStream, responseStream),
    });
  }
  methods.sort((a, b) => a.name.localeCompare(b.name));
  return methods;
}

/**
 * Walk a loaded package definition (the output of `loadPackageDefinition`, or a
 * plain map of `serviceName → serviceDefinition`) and produce the services /
 * methods introspection shape. Nested packages (dotted proto packages become
 * nested objects) are flattened with a dotted `name`.
 */
export function describeServices(pkg: PackageDefinition, prefix = ""): GrpcServiceInfo[] {
  const services: GrpcServiceInfo[] = [];
  for (const [key, value] of Object.entries(pkg ?? {})) {
    // Service entries from `loadPackageDefinition` are CONSTRUCTORS (functions)
    // carrying `.service`; namespaces + bare defs are plain objects. Accept both.
    if (!value || (typeof value !== "object" && typeof value !== "function")) continue;
    const qualified = prefix ? `${prefix}.${key}` : key;

    // Case 1: a service *constructor* carrying `.service` (from loadPackageDefinition).
    const ctor = value as ServiceConstructorLike;
    if (ctor.service && typeof ctor.service === "object") {
      services.push({ name: qualified, methods: describeService(ctor.service) });
      continue;
    }

    // Case 2: a bare service definition — a map whose values look like methods.
    const entries = Object.values(value as Record<string, unknown>);
    const looksLikeServiceDef =
      entries.length > 0 &&
      entries.every((m) => m != null && typeof m === "object" && ("requestStream" in (m as object) || "requestType" in (m as object) || "path" in (m as object)));
    if (looksLikeServiceDef) {
      services.push({ name: qualified, methods: describeService(value as ProtoServiceDefinition) });
      continue;
    }

    // Case 3: a nested namespace — recurse.
    services.push(...describeServices(value as PackageDefinition, qualified));
  }
  services.sort((a, b) => a.name.localeCompare(b.name));
  return services;
}

// ── call statistics tracker ───────────────────────────────────────────────────

/** One recent call record surfaced to devtools. */
export interface CallRecord {
  method: string;
  at: number;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface CallStatsSnapshot {
  calls: number;
  recent: CallRecord[];
}

/**
 * Counts handler invocations and keeps a bounded, newest-first ring of the last
 * `keep` call records for the devtools stats table. Pure + injectable clock so
 * it is fully unit-testable.
 */
export class CallStats {
  #calls = 0;
  readonly #recent: CallRecord[] = [];
  readonly #keep: number;
  readonly #now: () => number;

  constructor(opts: { keep?: number; now?: () => number } = {}) {
    this.#keep = Math.max(1, opts.keep ?? 50);
    this.#now = opts.now ?? (() => Date.now());
  }

  /** Total calls recorded. */
  get calls(): number {
    return this.#calls;
  }

  /**
   * Record a completed call. Pass the wall-clock `start` (ms) you captured
   * before invoking the handler; `ms` is derived from it.
   */
  record(method: string, start: number, ok: boolean, error?: string): void {
    this.#calls += 1;
    const rec: CallRecord = { method, at: this.#now(), ms: Math.max(0, this.#now() - start), ok };
    if (error) rec.error = error;
    this.#recent.unshift(rec);
    if (this.#recent.length > this.#keep) this.#recent.length = this.#keep;
  }

  /** A JSON-safe snapshot for the `/stats` route + devtools. */
  snapshot(): CallStatsSnapshot {
    return { calls: this.#calls, recent: [...this.#recent] };
  }
}
