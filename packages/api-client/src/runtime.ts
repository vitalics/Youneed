// @youneed/api-client/runtime — the base a generated client extends.
//
// The codegen emits typed methods that call `this.request(...)`; this base does
// the actual fetch (URL building, path-param substitution, query string, JSON
// body, error mapping). Kept tiny + dependency-free (global `fetch`), but any
// `fetch` can be injected — e.g. `@youneed/http-client`'s resilient client.

export interface ApiClientOptions {
  /** Base URL of the API, e.g. `"https://api.example.com"`. */
  baseUrl: string;
  /** Custom fetch (default global). Pass `createClient()` from @youneed/http-client for retries/timeouts. */
  fetch?: typeof fetch;
  /** Static or per-request headers (auth, etc.). */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
}

/** Thrown on a non-2xx response. Carries the status + parsed/raw body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly method: string,
    readonly path: string,
  ) {
    super(`API ${method} ${path} failed with ${status}`);
    this.name = "ApiError";
  }
}

/** What a generated method hands to {@link ApiClientBase.request}. */
export interface RequestSpec {
  /** Path params substituted into the template (`/users/{id}` ← `{ id }`). */
  params?: Record<string, string | number>;
  /** Query params (undefined entries skipped; arrays repeat the key). */
  query?: Record<string, unknown>;
  /** JSON request body. */
  body?: unknown;
}

/** Substitute `{name}` placeholders in a path template. */
export function buildPath(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(params[name] ?? "")));
}

/** Serialise a query object to a `URLSearchParams` string (skips undefined/null). */
export function buildQuery(query: Record<string, unknown> = {}): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) usp.append(k, String(item));
    else usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

/** The runtime base a generated `ApiClient` extends. */
export class ApiClientBase {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #headers: ApiClientOptions["headers"];

  constructor(opts: ApiClientOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.#fetch = opts.fetch ?? globalThis.fetch;
    this.#headers = opts.headers;
  }

  /** Perform one request. Generated methods call this; not usually called directly. */
  protected async request<T>(method: string, pathTemplate: string, spec: RequestSpec = {}): Promise<T> {
    const url = this.#baseUrl + buildPath(pathTemplate, spec.params) + buildQuery(spec.query);
    const headers: Record<string, string> = { ...(typeof this.#headers === "function" ? await this.#headers() : this.#headers) };
    const init: RequestInit = { method, headers };
    if (spec.body !== undefined) {
      headers["content-type"] ??= "application/json";
      init.body = JSON.stringify(spec.body);
    }
    const res = await this.#fetch(url, init);
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) throw new ApiError(res.status, data ?? text, method, pathTemplate);
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
