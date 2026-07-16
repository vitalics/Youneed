/** A JSON Schema (as produced by `@youneed/server`'s `toJsonSchema`). */
export type JsonSchema = Record<string, unknown>;
/** The schema attached to a route (each part already a JSON Schema). */
export interface RouteSchemas {
    params?: JsonSchema;
    query?: JsonSchema;
    body?: JsonSchema;
    response?: JsonSchema;
}
/** One route in a server's topology. */
export interface RouteInfo {
    method: string;
    path: string;
    /** Owning controller class name, if mounted via a `Controller`. */
    controller?: string;
    /** Guard count (class-level + per-method) — auth/authorization pre-gates. */
    guards?: number;
    /** Guard names (for documentation): a guard's `doc`, else its function name. */
    guardNames?: string[];
    /** Guard documentation (same order as {@link guardNames}): a guard's name +
     *  optional description, as produced by `app.topology()`'s `guardDocs`. The UI
     *  uses these for guard descriptions; it falls back to {@link guardNames} when absent. */
    guardDocs?: {
        name: string;
        description?: string;
    }[];
    /** Interceptor count wrapping the handler. */
    interceptors?: number;
    /** Names of route-scoped middleware (by mount prefix). */
    middleware?: string[];
    schema?: RouteSchemas;
    kind?: "http" | "ws" | "sse";
    summary?: string;
    tags?: string[];
    /** Infrastructure route (e.g. the devtools endpoint itself) — shown in the
     *  topology but excluded from the security audit. */
    internal?: boolean;
}
/** A server in the topology — ours or an external one. */
export interface ServerInfo {
    name: string;
    url?: string;
    /** An external server NOT served through our API (declared, not introspected). */
    external?: boolean;
    routes: RouteInfo[];
    /** App-level middleware names (e.g. "cors", "helmet", "rate-limit") — drives the audit. */
    middleware?: string[];
    /** Mounted server plugins (name + optional `inspect()` result, e.g. the jobs
     *  plugin returns `{ kind: "jobs", jobs: [...] }`). Shown in the Infra page. */
    plugins?: {
        name: string;
        info?: unknown;
    }[];
}
/** The whole topology: every server (ours + external). */
export interface ServerTopology {
    servers: ServerInfo[];
}
/** Assemble a topology from server infos. */
export declare function topology(servers: ServerInfo[]): ServerTopology;
/** The shape an `@youneed/server` app exposes via `app.topology()`. */
export interface AppLike {
    topology(): {
        routes: RouteInfo[];
        middleware?: string[];
        plugins?: {
            name: string;
            info?: unknown;
        }[];
    };
}
/** Build a {@link ServerInfo} from a live `@youneed/server` app's `topology()`.
 *  `meta.middleware` (the security-relevant names you mounted) overrides the
 *  best-effort names from the app, so the audit is accurate. */
export declare function fromApp(app: AppLike, meta: {
    name: string;
    url?: string;
    middleware?: string[];
}): ServerInfo;
/** Declare an external server (not behind our API) for the topology view. */
export declare function externalServer(info: Omit<ServerInfo, "external" | "routes"> & {
    routes?: RouteInfo[];
}): ServerInfo;
/** Merge several topologies into one (dedupes servers by name). */
export declare function mergeTopologies(...parts: ServerTopology[]): ServerTopology;
export type Severity = "info" | "warning" | "error";
export interface SecurityFinding {
    /** Stable rule id. */
    rule: string;
    severity: Severity;
    /** OWASP API Security Top 10 (2023) reference, e.g. "API2:2023". */
    owasp: string;
    /** The route this is about (omitted for server-wide findings). */
    route?: string;
    message: string;
    docs: string;
}
/** Run the OWASP-aligned heuristics over a server. */
export declare function securityAudit(server: ServerInfo): SecurityFinding[];
/** Roll the audit up to a single grade (worst severity present). */
export declare function auditGrade(findings: SecurityFinding[]): "pass" | "warning" | "error";
export interface OpenApiOptions {
    title?: string;
    version?: string;
}
/** Build an OpenAPI 3.1 document from a server's HTTP routes + their JSON schemas.
 *  Guarded routes are documented as secured: a `security` requirement, `401`/`403`
 *  responses, and the guard names in the operation description. */
export declare function toOpenApi(server: ServerInfo, options?: OpenApiOptions): Record<string, unknown>;
export interface BenchOptions {
    name?: string;
    /** Untimed warmup runs (default 100). */
    warmup?: number;
    /** Measured samples (default 200). */
    samples?: number;
    /** Iterations per sample — raise for sub-microsecond fns (default 1). */
    batch?: number;
}
export interface BenchResult {
    name: string;
    samples: number;
    opsPerSec: number;
    meanMs: number;
    p50: number;
    p99: number;
    minMs: number;
    maxMs: number;
}
/** Microbenchmark a synchronous function: warmup, then timed samples; reports
 *  ops/sec + mean/p50/p99 (per-op, in ms). */
export declare function microbench(fn: () => void, options?: BenchOptions): BenchResult;
/** Async variant of {@link microbench} (awaits each run). */
export declare function microbenchAsync(fn: () => Promise<void>, options?: BenchOptions): Promise<BenchResult>;
