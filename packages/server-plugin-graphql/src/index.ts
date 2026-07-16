// ── @youneed/server-plugin-graphql — a GraphQL endpoint over graphql-js ───────
//
// Mounts a spec-compliant GraphQL HTTP endpoint on `@youneed/server`, powered by
// the reference implementation [`graphql`](https://github.com/graphql/graphql-js).
// Give it an SDL string (built with `buildSchema`) or a pre-built `GraphQLSchema`,
// plus `rootValue`/`resolvers` — and it serves:
//
//   • `POST {path}`  — the standard `{ query, variables, operationName }` request.
//   • `GET  {path}`  — GraphiQL (an in-browser IDE) when the browser asks for HTML,
//                      or a simple `?query=` GET query otherwise.
//
// `graphql(opts)` is a ServerPlugin: it exposes the endpoint, tracks a ring buffer
// of recent operations, publishes the SDL — and, with `@youneed/server-plugin-devtools`
// mounted, surfaces a GraphQL tab (a mini query playground, the SDL, recent ops).
//
// NOTE: the export named `graphql` here is the PLUGIN. The graphql-js execute
// function (also `graphql`) is imported aliased as `runGraphQL`.

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";
import {
  graphql as runGraphQL,
  buildSchema,
  GraphQLSchema,
  printSchema,
  validateSchema,
  getIntrospectionQuery,
} from "graphql";

export { getIntrospectionQuery };

// ── types ───────────────────────────────────────────────────────────────────

/** A single recorded GraphQL operation, for the devtools recent-ops table. */
export interface RecordedOp {
  /** Epoch ms the operation completed. */
  at: number;
  /** The `operationName` (or `"anonymous"`). */
  operationName: string;
  /** `true` if the result carried no `errors`. */
  ok: boolean;
  /** Wall-clock duration in ms. */
  ms: number;
  /** The error messages, if any. */
  errors: string[];
}

/** The shape of an incoming GraphQL HTTP request body. */
export interface GraphQLRequest {
  query?: string;
  variables?: Record<string, unknown> | null;
  operationName?: string | null;
}

/** The GraphQL execution result (a subset of graphql-js's `ExecutionResult`). */
export interface GraphQLResult {
  data?: unknown;
  errors?: ReadonlyArray<{ message: string; [k: string]: unknown }>;
}

export interface GraphQLOptions {
  /** SDL string (built with graphql-js `buildSchema`) or a pre-built schema. */
  schema: string | GraphQLSchema;
  /**
   * The root resolver object — resolver fns keyed by field name. For an SDL
   * string schema these back the `Query`/`Mutation` fields (graphql-js resolves
   * against `rootValue` when a type has no field resolvers). Alias of `resolvers`.
   */
  rootValue?: Record<string, unknown>;
  /** Alias for {@link GraphQLOptions.rootValue}. Merged, `rootValue` wins on conflict. */
  resolvers?: Record<string, unknown>;
  /** Build the per-request `contextValue` passed to every resolver. */
  context?: (ctx: Context) => unknown;
  /** The endpoint path. Default `"/graphql"`. */
  path?: string;
  /** Serve GraphiQL on `GET {path}` when the browser asks for HTML. Default `true`. */
  graphiql?: boolean;
  /** How many recent operations to keep for devtools. Default `50`. */
  recentLimit?: number;
}

/** The `inspect()` payload — devtools detects the plugin by `kind === "graphql"`. */
export interface GraphQLInspect {
  kind: "graphql";
  path: string;
  typeCount: number;
  queryCount: number;
  recent: RecordedOp[];
  sdl: string;
  endpoints: { execute: string; schema: string; stats: string; graphiql?: string };
}

// ── pure execution helper (shared by the route + tests) ───────────────────────

/**
 * Execute one GraphQL operation against a schema. Pure — no HTTP, no state — so
 * both the POST/GET route handlers and the tests call the same code path.
 */
export async function executeOperation(
  schema: GraphQLSchema,
  req: GraphQLRequest,
  extra: { rootValue?: unknown; contextValue?: unknown } = {},
): Promise<GraphQLResult> {
  if (!req.query) {
    return { errors: [{ message: "Must provide a query string." }] };
  }
  const result = await runGraphQL({
    schema,
    source: req.query,
    rootValue: extra.rootValue,
    contextValue: extra.contextValue,
    variableValues: (req.variables ?? undefined) as Record<string, unknown> | undefined,
    operationName: req.operationName ?? undefined,
  });
  // Normalize graphql-js's GraphQLError[] into plain `{ message }` objects.
  return {
    data: result.data ?? undefined,
    errors: result.errors?.map((e: GraphQLErrorLike) => ({ message: e.message, ...serializeError(e) })),
  };
}

/** The subset of a graphql-js `GraphQLError` we serialize (kept local so this
 *  module type-checks even before `graphql` is installed). */
interface GraphQLErrorLike {
  message: string;
  path?: readonly (string | number)[];
  locations?: unknown;
}

function serializeError(e: GraphQLErrorLike): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.path) out.path = e.path;
  if (e.locations) out.locations = e.locations;
  return out;
}

/** Coerce the `schema` option to a concrete `GraphQLSchema` (building SDL if needed). */
export function resolveSchema(schema: string | GraphQLSchema): GraphQLSchema {
  const built = typeof schema === "string" ? buildSchema(schema) : schema;
  const errors = validateSchema(built);
  if (errors.length) throw new Error(`invalid GraphQL schema: ${errors.map((e: { message: string }) => e.message).join("; ")}`);
  return built;
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

/**
 * A `GraphQL` instance: the built schema, the merged root resolvers and a ring
 * buffer of recent operations. Held by the plugin; also usable standalone.
 */
export class GraphQL {
  readonly schema: GraphQLSchema;
  readonly rootValue: Record<string, unknown>;
  readonly #context?: (ctx: Context) => unknown;
  readonly #recent: RecordedOp[] = [];
  readonly #recentLimit: number;
  #count = 0;

  constructor(opts: GraphQLOptions) {
    this.schema = resolveSchema(opts.schema);
    this.rootValue = { ...(opts.resolvers ?? {}), ...(opts.rootValue ?? {}) };
    this.#context = opts.context;
    this.#recentLimit = Math.max(1, opts.recentLimit ?? 50);
  }

  /** Total operations executed since start. */
  get count(): number {
    return this.#count;
  }

  /** The SDL for the schema (schema-first or printed from a programmatic schema). */
  get sdl(): string {
    return printSchema(this.schema);
  }

  /** A copy of the recent-operations ring buffer (newest last). */
  recent(): RecordedOp[] {
    return [...this.#recent];
  }

  /** Number of named types in the schema (excludes GraphQL introspection types). */
  get typeCount(): number {
    return Object.keys(this.schema.getTypeMap()).filter((n) => !n.startsWith("__")).length;
  }

  /** Execute a request, recording it in the ring buffer. `ctx` builds `contextValue`. */
  async execute(req: GraphQLRequest, ctx?: Context): Promise<GraphQLResult> {
    const started = Date.now();
    const contextValue = ctx && this.#context ? this.#context(ctx) : undefined;
    const result = await executeOperation(this.schema, req, { rootValue: this.rootValue, contextValue });
    this.#record({
      at: Date.now(),
      operationName: req.operationName || operationNameOf(req.query) || "anonymous",
      ok: !result.errors || result.errors.length === 0,
      ms: Date.now() - started,
      errors: (result.errors ?? []).map((e) => e.message),
    });
    return result;
  }

  #record(op: RecordedOp): void {
    this.#count++;
    this.#recent.push(op);
    if (this.#recent.length > this.#recentLimit) this.#recent.shift();
  }
}

/** The name of the first named operation in a query, if any (`query Foo {…}`). */
function operationNameOf(query: string | undefined): string | undefined {
  return query ? /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/.exec(query)?.[1] : undefined;
}

/**
 * Mount a GraphQL endpoint as a ServerPlugin. Serves `POST {path}` (the standard
 * request) and `GET {path}` (GraphiQL / `?query=`), plus internal `schema`/`stats`
 * routes the devtools panel reads. Detects itself in devtools via `inspect()`.
 *
 * The export is named `graphql` (the plugin) — graphql-js's execute fn is imported
 * aliased as `runGraphQL` to avoid the collision.
 */
export function graphql(opts: GraphQLOptions): ServerPlugin & { graphql: GraphQL } {
  const gql = new GraphQL(opts);
  const path = (opts.path ?? "/graphql").replace(/\/$/, "") || "/graphql";
  const graphiqlEnabled = opts.graphiql ?? true;
  const endpoints = {
    execute: path,
    schema: `${path}/__schema`,
    stats: `${path}/__stats`,
    graphiql: graphiqlEnabled ? path : undefined,
  };

  return {
    name: "graphql",
    graphql: gql,
    setup(app) {
      // POST {path} — the standard GraphQL-over-HTTP request.
      app.post(path, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as GraphQLRequest;
        if (!body.query) return Response.json({ errors: [{ message: "Must provide a query string." }] }, { status: 400 });
        const result = await gql.execute(body, ctx);
        const status = result.errors && !result.data ? 400 : 200;
        return Response.json(result, { status });
      });

      // GET {path} — GraphiQL for browsers, else a simple `?query=` GET query.
      app.get(path, async (ctx: Context) => {
        const accept = String(ctx.request.headers?.accept ?? "");
        const hasQuery = typeof ctx.query?.query === "string" && ctx.query.query.length > 0;
        if (graphiqlEnabled && !hasQuery && accept.includes("text/html")) {
          return Response.text(graphiqlPage(path), { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        if (!hasQuery) return Response.json({ errors: [{ message: "Must provide a query string." }] }, { status: 400 });
        let variables: Record<string, unknown> | undefined;
        if (typeof ctx.query?.variables === "string") {
          try {
            variables = JSON.parse(ctx.query.variables);
          } catch {
            return Response.json({ errors: [{ message: "variables must be valid JSON" }] }, { status: 400 });
          }
        }
        const result = await gql.execute({ query: ctx.query.query, variables, operationName: ctx.query?.operationName }, ctx);
        const status = result.errors && !result.data ? 400 : 200;
        return Response.json(result, { status });
      });

      // Internal routes the devtools panel reads (SDL + recent ops / counts).
      app.get(endpoints.schema, () => Response.json({ sdl: gql.sdl }));
      app.get(endpoints.stats, () => Response.json({ count: gql.count, typeCount: gql.typeCount, recent: gql.recent() }));
    },
    inspect(): GraphQLInspect {
      // Sync — topology never awaits it. The counts/recent live in memory so we
      // can include a snapshot; the devtools panel still refreshes over `stats`.
      return {
        kind: "graphql",
        path,
        typeCount: gql.typeCount,
        queryCount: gql.count,
        recent: gql.recent(),
        sdl: gql.sdl,
        endpoints,
      };
    },
  };
}

/** Convenience: build a standalone {@link GraphQL} (no plugin). */
export function createGraphQL(opts: GraphQLOptions): GraphQL {
  return new GraphQL(opts);
}

// ── GraphiQL page ─────────────────────────────────────────────────────────────

/** A minimal GraphiQL IDE page (loaded from unpkg CDN) targeting `endpoint`. */
function graphiqlPage(endpoint: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GraphiQL</title>
    <style>body { margin: 0; height: 100vh; } #graphiql { height: 100vh; }</style>
    <link rel="stylesheet" href="https://unpkg.com/graphiql/graphiql.min.css" />
  </head>
  <body>
    <div id="graphiql">Loading GraphiQL…</div>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/graphiql/graphiql.min.js"></script>
    <script>
      const fetcher = GraphiQL.createFetcher({ url: ${JSON.stringify(endpoint)} });
      const root = ReactDOM.createRoot(document.getElementById("graphiql"));
      root.render(React.createElement(GraphiQL, { fetcher }));
    </script>
  </body>
</html>`;
}
