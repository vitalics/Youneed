// @youneed/api-client/codegen — OpenAPI 3.x → a typed TypeScript client.
//
// Consumes the OpenAPI document `@youneed/server` generates (inline JSON-Schema,
// no $ref/components) and emits a single `.ts` module: interfaces for bodies/
// responses inline, plus an `ApiClient extends ApiClientBase` with one typed
// method per operation. `operationId` names a method when present; otherwise the
// name is derived from the HTTP method + path.

// ── minimal OpenAPI shapes we read ────────────────────────────────────────────

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  nullable?: boolean;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  $ref?: string;
}
export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: JsonSchema;
}
export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: JsonSchema }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: JsonSchema }> }>;
}
export interface OpenApiDoc {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

export interface GenerateOptions {
  /** Exported client class name. Default `"ApiClient"`. */
  className?: string;
  /** Import specifier for the runtime base. Default `"@youneed/api-client"`. */
  runtimeModule?: string;
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];

// ── JSON Schema → TS type ─────────────────────────────────────────────────────

/** Render a JSON schema as a TypeScript type expression. */
export function tsType(schema: JsonSchema | undefined): string {
  if (!schema) return "unknown";
  if (schema.$ref) return schema.$ref.split("/").pop() || "unknown";
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ") || "never";
  const union = schema.oneOf ?? schema.anyOf;
  if (union) return withNull(union.map(tsType).join(" | "), schema);
  if (schema.allOf) return withNull(schema.allOf.map(tsType).join(" & "), schema);

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const nullable = schema.nullable || types.includes("null");
  const core = types.filter((t) => t !== "null");
  const one = (t: string): string => {
    switch (t) {
      case "string":
        return "string";
      case "integer":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "array":
        return `${tsType(schema.items)}[]`;
      case "object":
        return objectType(schema);
      default:
        return "unknown";
    }
  };
  let out = core.length ? core.map(one).join(" | ") : schema.properties ? objectType(schema) : "unknown";
  if (nullable) out += " | null";
  return out;
}

function withNull(inner: string, schema: JsonSchema): string {
  return schema.nullable ? `${inner} | null` : inner;
}

function objectType(schema: JsonSchema): string {
  const props = schema.properties;
  if (!props) {
    const ap = schema.additionalProperties;
    return ap && ap !== true ? `Record<string, ${tsType(ap as JsonSchema)}>` : "Record<string, unknown>";
  }
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(props).map(([name, s]) => `${safeKey(name)}${required.has(name) ? "" : "?"}: ${tsType(s)}`);
  return `{ ${fields.join("; ")} }`;
}

const safeKey = (k: string): string => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));

// ── operation → method ────────────────────────────────────────────────────────

const pascal = (s: string): string => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c: string) => c.toUpperCase());

/** Derive a method name for an operation (operationId wins). */
export function methodName(method: string, path: string, operationId?: string): string {
  if (operationId) return operationId.replace(/[^A-Za-z0-9]+(.)/g, (_, c: string) => c.toUpperCase());
  const segments = path.split("/").filter(Boolean);
  const statics = segments.filter((s) => !s.startsWith("{"));
  const params = segments.filter((s) => s.startsWith("{")).map((s) => s.slice(1, -1));
  let name = method.toLowerCase() + statics.map(pascal).join("");
  if (params.length) name += "By" + params.map(pascal).join("And");
  return name || method.toLowerCase();
}

function successSchema(op: OpenApiOperation): JsonSchema | undefined {
  const responses = op.responses ?? {};
  const status = Object.keys(responses).find((s) => s.startsWith("2")) ?? "200";
  return responses[status]?.content?.["application/json"]?.schema;
}

function bodySchema(op: OpenApiOperation): JsonSchema | undefined {
  return op.requestBody?.content?.["application/json"]?.schema;
}

/** Emit the typed args interface + the method body for one operation. */
function emitMethod(method: string, path: string, op: OpenApiOperation): string {
  const name = op.operationId ? methodName(method, path, op.operationId) : methodName(method, path);
  const params = op.parameters ?? [];
  const pathParams = params.filter((p) => p.in === "path");
  const queryParams = params.filter((p) => p.in === "query");
  const body = bodySchema(op);

  const argFields: string[] = [];
  for (const p of pathParams) argFields.push(`${safeKey(p.name)}: ${tsType(p.schema) === "unknown" ? "string | number" : tsType(p.schema)}`);
  if (queryParams.length) {
    const q = queryParams.map((p) => `${safeKey(p.name)}${p.required ? "" : "?"}: ${tsType(p.schema)}`).join("; ");
    argFields.push(`query${queryParams.every((p) => !p.required) ? "?" : ""}: { ${q} }`);
  }
  if (body) argFields.push(`body: ${tsType(body)}`);

  const hasArgs = argFields.length > 0;
  const argType = hasArgs ? `args: { ${argFields.join("; ")} }` : "";
  const ret = tsType(successSchema(op)) || "unknown";
  const doc = op.summary || op.description;

  const specParts: string[] = [];
  if (pathParams.length) specParts.push(`params: { ${pathParams.map((p) => `${safeKey(p.name)}: args.${p.name}`).join(", ")} }`);
  if (queryParams.length) specParts.push(`query: args.query`);
  if (body) specParts.push(`body: args.body`);
  const spec = specParts.length ? `, { ${specParts.join(", ")} }` : "";

  return [
    doc ? `  /** ${doc.replace(/\n/g, " ")} */` : undefined,
    `  ${name}(${argType}): Promise<${ret}> {`,
    `    return this.request<${ret}>(${JSON.stringify(method.toUpperCase())}, ${JSON.stringify(path)}${spec});`,
    `  }`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate a typed TypeScript client module from an OpenAPI document.
 * Returns the `.ts` source as a string.
 */
export function generateClient(doc: OpenApiDoc, opts: GenerateOptions = {}): string {
  const className = opts.className ?? "ApiClient";
  const runtimeModule = opts.runtimeModule ?? "@youneed/api-client";
  const title = doc.info?.title ?? "API";
  const version = doc.info?.version ?? "";
  const usedNames = new Set<string>();

  const methods: string[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      // de-dupe method names
      let name = op.operationId ? methodName(method, path, op.operationId) : methodName(method, path);
      let n = name;
      let i = 2;
      while (usedNames.has(n)) n = `${name}${i++}`;
      usedNames.add(n);
      methods.push(emitMethod(method, path, { ...op, operationId: n }));
    }
  }

  return `// AUTO-GENERATED by @youneed/api-client — do not edit by hand.
// Source: ${title}${version ? ` v${version}` : ""}
import { ApiClientBase } from ${JSON.stringify(runtimeModule)};
export type { ApiClientOptions } from ${JSON.stringify(runtimeModule)};
export { ApiError } from ${JSON.stringify(runtimeModule)};

/** Typed client for ${title}. */
export class ${className} extends ApiClientBase {
${methods.join("\n\n")}
}
`;
}
