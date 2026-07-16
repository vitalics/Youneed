// ── @youneed/server-plugin-devtools — analysis core (pure, browser-safe) ─────
//
// The renderer-agnostic, dependency-free data layer: the topology model + the
// tools over it (OWASP audit, OpenAPI, microbench). NO Node imports here, so the
// browser UI (`ui.ts`) and the server plugin (`serve.ts`) both import from here.
// `index.ts` is the public barrel (this core + the Node-only `serve.ts`).

// ── topology model ─────────────────────────────────────────────────────────────

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
  method: string; // "GET" | "POST" | … | "WS" | "SSE"
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
  guardDocs?: { name: string; description?: string }[];
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
  plugins?: { name: string; info?: unknown }[];
}

/** The whole topology: every server (ours + external). */
export interface ServerTopology {
  servers: ServerInfo[];
}

/** Assemble a topology from server infos. */
export function topology(servers: ServerInfo[]): ServerTopology {
  return { servers };
}

/** The shape an `@youneed/server` app exposes via `app.topology()`. */
export interface AppLike {
  topology(): { routes: RouteInfo[]; middleware?: string[]; plugins?: { name: string; info?: unknown }[] };
}

/** Build a {@link ServerInfo} from a live `@youneed/server` app's `topology()`.
 *  `meta.middleware` (the security-relevant names you mounted) overrides the
 *  best-effort names from the app, so the audit is accurate. */
export function fromApp(
  app: AppLike,
  meta: { name: string; url?: string; middleware?: string[] },
): ServerInfo {
  const snapshot = app.topology();
  return {
    name: meta.name,
    url: meta.url,
    routes: snapshot.routes,
    middleware: meta.middleware ?? snapshot.middleware ?? [],
    plugins: snapshot.plugins,
  };
}

/** Declare an external server (not behind our API) for the topology view. */
export function externalServer(info: Omit<ServerInfo, "external" | "routes"> & { routes?: RouteInfo[] }): ServerInfo {
  return { external: true, ...info, routes: info.routes ?? [] };
}

/** Merge several topologies into one (dedupes servers by name). */
export function mergeTopologies(...parts: ServerTopology[]): ServerTopology {
  const byName = new Map<string, ServerInfo>();
  for (const part of parts) for (const s of part.servers) byName.set(s.name, s);
  return { servers: [...byName.values()] };
}

// ── OWASP-aligned security audit ─────────────────────────────────────────────────
// Heuristics over the topology + mounted middleware, mapped to the OWASP API
// Security Top 10 (2023). Not a substitute for a real audit — a fast first pass.

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

const OWASP_DOCS = "https://owasp.org/API-Security/editions/2023/en/0x11-t10/";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const has = (mw: string[] | undefined, name: string): boolean =>
  !!mw?.some((m) => m.toLowerCase().includes(name));
// Any auth-ish middleware mounted server-wide counts as a baseline gate.
const AUTH_MW = ["bearer", "basic-auth", "session", "auth"];

/** Run the OWASP-aligned heuristics over a server. */
export function securityAudit(server: ServerInfo): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  const mw = server.middleware ?? [];
  const add = (f: Omit<SecurityFinding, "docs">): void => void out.push({ ...f, docs: OWASP_DOCS });
  const serverAuth = AUTH_MW.some((a) => has(mw, a));

  // ── server-wide misconfiguration (API8:2023) ──
  if (!has(mw, "rate-limit"))
    add({ rule: "no-rate-limit", severity: "warning", owasp: "API4:2023", message: "No rate-limit middleware — unrestricted resource consumption." });
  if (!has(mw, "helmet"))
    add({ rule: "no-security-headers", severity: "warning", owasp: "API8:2023", message: "No helmet/security-headers middleware." });
  if (!has(mw, "cors"))
    add({ rule: "no-cors", severity: "info", owasp: "API8:2023", message: "No CORS policy configured — defaults may be permissive or absent." });
  if (!has(mw, "body-limit"))
    add({ rule: "no-body-limit", severity: "warning", owasp: "API4:2023", message: "No body-limit middleware — large payloads accepted." });
  if (!has(mw, "https-redirect"))
    add({ rule: "no-https-redirect", severity: "info", owasp: "API8:2023", message: "No HTTPS redirect — traffic may be served over plaintext." });

  // ── per-route ──
  for (const r of server.routes) {
    if (r.internal) continue; // infra route (e.g. the devtools endpoint) — not audited
    const where = `${r.method} ${r.path}`;
    const guarded = (r.guards ?? 0) > 0 || serverAuth;
    // API2/API5: mutating route with no auth gate (guard or auth middleware).
    if (MUTATING.has(r.method) && !guarded)
      add({ rule: "unauthenticated-mutation", severity: "error", owasp: "API2:2023", route: where, message: `${where} mutates state with no guard or auth middleware.` });
    // API3/tampering: body-carrying route with no body schema → no input validation.
    // (DELETE conventionally carries no body, so it's excluded.)
    const carriesBody = r.method === "POST" || r.method === "PUT" || r.method === "PATCH" || r.method === "QUERY";
    if (carriesBody && !r.schema?.body)
      add({ rule: "no-input-validation", severity: "warning", owasp: "API3:2023", route: where, message: `${where} accepts a body but declares no validation schema.` });
    // API1 BOLA hint: an id path param on a route with no guard.
    if (/[:{]\w*id\w*[}]?/i.test(r.path) && !guarded)
      add({ rule: "object-level-auth", severity: "warning", owasp: "API1:2023", route: where, message: `${where} addresses an object by id with no guard (check object-level authorization).` });
  }
  return out;
}

/** Roll the audit up to a single grade (worst severity present). */
export function auditGrade(findings: SecurityFinding[]): "pass" | "warning" | "error" {
  if (findings.some((f) => f.severity === "error")) return "error";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  return "pass";
}

// ── OpenAPI generation ───────────────────────────────────────────────────────────

export interface OpenApiOptions {
  title?: string;
  version?: string;
}

const PARAM_LIKE: Array<["params" | "query", "path" | "query"]> = [
  ["params", "path"],
  ["query", "query"],
];

const guardCount = (r: RouteInfo): number => r.guardNames?.length ?? r.guards ?? 0;

/** Build an OpenAPI 3.1 document from a server's HTTP routes + their JSON schemas.
 *  Guarded routes are documented as secured: a `security` requirement, `401`/`403`
 *  responses, and the guard names in the operation description. */
export function toOpenApi(server: ServerInfo, options: OpenApiOptions = {}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  let anyGuards = false;
  for (const r of server.routes) {
    if (r.kind && r.kind !== "http") continue; // ws/sse aren't OpenAPI
    if (r.internal) continue; // infra routes (devtools endpoint) aren't part of the API
    const oaPath = r.path.replace(/:(\w+)/g, "{$1}"); // ":id" → "{id}"
    const op: Record<string, unknown> = {};
    if (r.summary) op.summary = r.summary;
    if (r.tags) op.tags = r.tags;

    const parameters: Array<Record<string, unknown>> = [];
    for (const [key, location] of PARAM_LIKE) {
      const schema = r.schema?.[key];
      const props = (schema?.properties as Record<string, JsonSchema> | undefined) ?? {};
      const required = (schema?.required as string[] | undefined) ?? [];
      for (const [name, propSchema] of Object.entries(props)) {
        parameters.push({ name, in: location, required: location === "path" || required.includes(name), schema: propSchema });
      }
    }
    if (parameters.length) op.parameters = parameters;
    if (r.schema?.body)
      op.requestBody = { required: true, content: { "application/json": { schema: r.schema.body } } };

    const responses: Record<string, unknown> = r.schema?.response
      ? { "200": { description: "OK", content: { "application/json": { schema: r.schema.response } } } }
      : { "200": { description: "OK" } };

    // Document guards as a security requirement + the auth failure responses.
    if (guardCount(r) > 0) {
      anyGuards = true;
      op.security = [{ guard: [] }];
      responses["401"] = { description: "Unauthorized — guard rejected the request" };
      responses["403"] = { description: "Forbidden — guard denied access" };
      const names = r.guardNames?.filter(Boolean) ?? [];
      const note = names.length ? `Protected by guard(s): ${names.join(", ")}.` : "Protected by a guard.";
      op.description = op.summary ? `${op.summary}\n\n${note}` : note;
      op["x-guards"] = names; // machine-readable guard list
    }

    op.responses = responses;
    (paths[oaPath] ??= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: options.title ?? server.name, version: options.version ?? "1.0.0" },
    ...(server.url ? { servers: [{ url: server.url }] } : {}),
    paths,
    // A guard maps to a security scheme (best-effort: bearer auth) so guarded
    // operations reference it — tooling renders the "Authorize" affordance.
    ...(anyGuards
      ? { components: { securitySchemes: { guard: { type: "http", scheme: "bearer", description: "Route guard (auth/authorization)." } } } }
      : {}),
  };
}

// ── AsyncAPI generation ──────────────────────────────────────────────────────────

export interface AsyncApiOptions {
  title?: string;
  version?: string;
}

/** Build an AsyncAPI 2.6 document from a server's WebSocket + SSE routes. A `ws`
 *  channel is bidirectional (`publish` = client→server, `subscribe` = server→
 *  client); an `sse` channel is `subscribe`-only (the server pushes). Message
 *  payloads use the route's `body`/`response` JSON schema when present. */
export function toAsyncApi(server: ServerInfo, options: AsyncApiOptions = {}): Record<string, unknown> {
  const channels: Record<string, Record<string, unknown>> = {};
  const message = (schema?: JsonSchema): Record<string, unknown> => ({ message: { payload: schema ?? {} } });

  for (const r of server.routes) {
    if (r.kind !== "ws" && r.kind !== "sse") continue; // only event-driven routes
    if (r.internal) continue; // infra channels (devtools WS) aren't part of the API
    const ch: Record<string, unknown> = {};
    if (r.summary) ch.description = r.summary;
    if (r.tags) ch.tags = r.tags.map((name) => ({ name }));

    if (r.kind === "sse") {
      ch.subscribe = message(r.schema?.response); // server → client
      ch.bindings = { sse: {} };
    } else {
      ch.subscribe = message(r.schema?.response); // server → client
      ch.publish = message(r.schema?.body); // client → server
      ch.bindings = { ws: {} };
    }
    channels[r.path] = ch;
  }

  return {
    asyncapi: "2.6.0",
    info: { title: options.title ?? server.name, version: options.version ?? "1.0.0" },
    ...(server.url
      ? { servers: { production: { url: server.url.replace(/^http/, "ws"), protocol: "ws" } } }
      : {}),
    channels,
  };
}

// ── microbenchmark ─────────────────────────────────────────────────────────────

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

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

function summarize(name: string, times: number[]): BenchResult {
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const pct = (p: number): number => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
  return {
    name,
    samples: times.length,
    opsPerSec: mean > 0 ? 1000 / mean : Infinity,
    meanMs: mean,
    p50: pct(50),
    p99: pct(99),
    minMs: times[0],
    maxMs: times[times.length - 1],
  };
}

/** Microbenchmark a synchronous function: warmup, then timed samples; reports
 *  ops/sec + mean/p50/p99 (per-op, in ms). */
export function microbench(fn: () => void, options: BenchOptions = {}): BenchResult {
  const { name = "bench", warmup = 100, samples = 200, batch = 1 } = options;
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let s = 0; s < samples; s++) {
    const t0 = now();
    for (let b = 0; b < batch; b++) fn();
    times.push((now() - t0) / batch);
  }
  return summarize(name, times);
}

/** Async variant of {@link microbench} (awaits each run). */
export async function microbenchAsync(fn: () => Promise<void>, options: BenchOptions = {}): Promise<BenchResult> {
  const { name = "bench", warmup = 20, samples = 100, batch = 1 } = options;
  for (let i = 0; i < warmup; i++) await fn();
  const times: number[] = [];
  for (let s = 0; s < samples; s++) {
    const t0 = now();
    for (let b = 0; b < batch; b++) await fn();
    times.push((now() - t0) / batch);
  }
  return summarize(name, times);
}
