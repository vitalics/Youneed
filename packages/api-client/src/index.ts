// @youneed/api-client — a typed API client + OpenAPI → client codegen.
//
// Runtime: `ApiClientBase` (the base a generated client extends) + `ApiError`.
// Codegen: `generateClient(openApiDoc)` → a `.ts` module of typed methods. A CLI
// (`youneed-api-codegen`) writes it from a spec file or a live server URL.
export { ApiClientBase, ApiError, buildPath, buildQuery } from "./runtime.ts";
export type { ApiClientOptions, RequestSpec } from "./runtime.ts";

export { generateClient, tsType, methodName } from "./codegen.ts";
export type { OpenApiDoc, OpenApiOperation, OpenApiParameter, JsonSchema, GenerateOptions } from "./codegen.ts";
