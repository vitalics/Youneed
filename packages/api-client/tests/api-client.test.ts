// Run: pnpm --filter @youneed/api-client test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { generateClient, tsType, methodName, ApiClientBase, ApiError, buildPath, buildQuery, type OpenApiDoc } from "../src/index.ts";

// A spec shaped like the one @youneed/server emits (inline schemas, no operationId).
const SPEC: OpenApiDoc = {
  openapi: "3.1.0",
  info: { title: "Demo", version: "1.0.0" },
  paths: {
    "/users": {
      get: { responses: { "200": { content: { "application/json": { schema: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } }, required: ["id", "name"] } } } } } } },
      post: {
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } } },
        responses: { "200": { content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } } },
      },
    },
    "/users/{id}": {
      get: {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "expand", in: "query", required: false, schema: { type: "boolean" } },
        ],
        responses: { "200": { content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } } } } },
      },
    },
  },
};

// Expose the protected request() for the runtime test.
class TestClient extends ApiClientBase {
  call<T>(method: string, path: string, spec?: Parameters<ApiClientBase["request"]>[2]): Promise<T> {
    // @ts-expect-error access protected for the test
    return this.request<T>(method, path, spec);
  }
}

class ApiClientSuite extends Test({ name: "@youneed/api-client" }) {
  // ── codegen ──
  @Test.it("tsType maps JSON schema to TS") types() {
    expect(tsType({ type: "string" })).toBe("string");
    expect(tsType({ type: "integer" })).toBe("number");
    expect(tsType({ type: "array", items: { type: "string" } })).toBe("string[]");
    expect(tsType({ type: "object", properties: { a: { type: "string" } }, required: ["a"] })).toBe("{ a: string }");
    expect(tsType({ enum: ["a", "b"] })).toBe('"a" | "b"');
    expect(tsType({ type: "string", nullable: true })).toBe("string | null");
  }

  @Test.it("methodName derives from method + path") names() {
    expect(methodName("get", "/users")).toBe("getUsers");
    expect(methodName("get", "/users/{id}")).toBe("getUsersById");
    expect(methodName("post", "/users")).toBe("postUsers");
    expect(methodName("get", "/x", "listThings")).toBe("listThings");
  }

  @Test.it("generateClient emits a typed client class") generate() {
    const code = generateClient(SPEC);
    expect(code.includes("export class ApiClient extends ApiClientBase")).toBe(true);
    expect(code.includes('import { ApiClientBase } from "@youneed/api-client"')).toBe(true);
    expect(code.includes("getUsers(): Promise<{ id: number; name: string }[]>")).toBe(true);
    expect(code.includes("postUsers(args: { body: { name?: string } | { name: string } }") || code.includes("body: { name: string }")).toBe(true);
    expect(code.includes("getUsersById(args: { id: number; query?: { expand?: boolean } })")).toBe(true);
    expect(code.includes('("GET", "/users/{id}", { params: { id: args.id }, query: args.query })')).toBe(true);
  }

  @Test.it("custom class name + runtime module") options() {
    const code = generateClient(SPEC, { className: "PetStore", runtimeModule: "../rt.ts" });
    expect(code.includes("export class PetStore extends ApiClientBase")).toBe(true);
    expect(code.includes('from "../rt.ts"')).toBe(true);
  }

  // ── runtime ──
  @Test.it("buildPath / buildQuery") urls() {
    expect(buildPath("/users/{id}", { id: 7 })).toBe("/users/7");
    expect(buildQuery({ a: 1, b: undefined, c: ["x", "y"] })).toBe("?a=1&c=x&c=y");
    expect(buildQuery({})).toBe("");
  }

  @Test.it("request builds URL, sends JSON, parses response") async request() {
    let seen: { url: string; init: any } | undefined;
    const fetch = (async (url: string, init: any) => {
      seen = { url: String(url), init };
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 1 }) } as Response;
    }) as unknown as typeof globalThis.fetch;
    const client = new TestClient({ baseUrl: "https://api.test/", fetch, headers: { authorization: "Bearer t" } });
    const out = await client.call("POST", "/users/{id}", { params: { id: 9 }, query: { dry: true }, body: { name: "ada" } });
    expect(out).toEqual({ id: 1 });
    expect(seen!.url).toBe("https://api.test/users/9?dry=true");
    expect(seen!.init.method).toBe("POST");
    expect(seen!.init.headers.authorization).toBe("Bearer t");
    expect(JSON.parse(seen!.init.body)).toEqual({ name: "ada" });
  }

  @Test.it("non-2xx throws ApiError with status + body") async errors() {
    const fetch = (async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ error: "nope" }) }) as Response) as unknown as typeof globalThis.fetch;
    const client = new TestClient({ baseUrl: "https://api.test", fetch });
    let err: ApiError | undefined;
    try {
      await client.call("GET", "/missing");
    } catch (e) {
      err = e as ApiError;
    }
    expect(err instanceof ApiError).toBe(true);
    expect(err!.status).toBe(404);
    expect(err!.body).toEqual({ error: "nope" });
  }
}

await TestApplication().addTests(ApiClientSuite).reporter(new ConsoleReporter()).run();
