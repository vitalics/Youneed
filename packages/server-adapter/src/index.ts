// @youneed/server-adapter — run ONE @youneed/server app on any runtime.
//
// The server core speaks node:http `(req, res)`. Most runtimes only expose a Web
// `fetch(Request) => Response` (Bun, Deno, Cloudflare Workers, Vercel/Netlify
// edge, Lambda function URLs). `toFetchHandler(app)` bridges the two: it builds
// the app's Node request listener once (`app.handler()`), then per request shims a
// `Request` into a Node `IncomingMessage` and collects the Node `ServerResponse`
// back into a streaming `Response`. The runtime adapters (node/bun/deno) wrap that
// for each host's `serve`.
import { Readable, Writable } from "node:stream";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NodeRequestListener } from "@youneed/server";

/** The minimal app surface this package needs (an `Application(...)` builder). */
export interface AppLike {
  handler(): NodeRequestListener;
}

/** A Web fetch handler: the shape every edge/serverless runtime consumes. */
export type FetchHandler = (request: Request) => Promise<Response>;

// ── Web Request → Node IncomingMessage shim ─────────────────────────────────────

function headersObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function toNodeRequest(request: Request): Promise<IncomingMessage> {
  const url = new URL(request.url);
  // Buffer the body up front — the core buffers it anyway (collectRaw) before
  // routing, so there's nothing to gain from streaming the request in.
  const hasBody = request.body != null && request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;

  const req = new Readable({ read() {} }) as Readable & Record<string, unknown>;
  if (body && body.length) req.push(body);
  req.push(null);
  req.headers = headersObject(request.headers);
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.httpVersion = "1.1";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  // A few middlewares read `socket` (remote addr / TLS). Provide a benign stub.
  req.socket = { remoteAddress: url.hostname, encrypted: url.protocol === "https:" };
  return req as unknown as IncomingMessage;
}

// ── Node ServerResponse → Web Response shim ─────────────────────────────────────

// Statuses that MUST carry a null body (the Response ctor throws otherwise).
const NULL_BODY = new Set([101, 204, 205, 304]);

function buildHeaders(map: Map<string, number | string | string[]>): Headers {
  const h = new Headers();
  for (const [key, value] of map) {
    if (Array.isArray(value)) for (const v of value) h.append(key, v); // e.g. set-cookie
    else h.set(key, String(value));
  }
  return h;
}

function makeNodeResponse(): { res: ServerResponse; response: Promise<Response> } {
  let resolve!: (r: Response) => void;
  const response = new Promise<Response>((r) => (resolve = r));

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const headers = new Map<string, number | string | string[]>();
  let committed = false;

  const res = new Writable({
    write(chunk, _enc, cb) {
      commit();
      controller?.enqueue(toU8(chunk));
      cb();
    },
    final(cb) {
      commit();
      try {
        controller?.close();
      } catch {
        /* already closed */
      }
      cb();
    },
  }) as Writable & Record<string, unknown>;

  res.statusCode = 200;
  res.statusMessage = "";

  function commit(): void {
    if (committed) return;
    committed = true;
    res.headersSent = true;
    const status = res.statusCode as number;
    const noBody = NULL_BODY.has(status);
    if (noBody) {
      try {
        controller?.close();
      } catch {
        /* noop */
      }
    }
    resolve(
      new Response(noBody ? null : stream, {
        status,
        statusText: (res.statusMessage as string) || undefined,
        headers: buildHeaders(headers),
      }),
    );
  }

  // The ServerResponse header API the core uses.
  res.headersSent = false;
  res.setHeader = (k: string, v: number | string | string[]) => (headers.set(k.toLowerCase(), v), res);
  res.getHeader = (k: string) => headers.get(k.toLowerCase());
  res.getHeaders = () => Object.fromEntries(headers);
  res.hasHeader = (k: string) => headers.has(k.toLowerCase());
  res.removeHeader = (k: string) => void headers.delete(k.toLowerCase());
  res.writeHead = (status: number, a?: unknown, b?: unknown) => {
    res.statusCode = status;
    const hdrs = (typeof a === "object" && a ? a : b) as Record<string, number | string | string[]> | undefined;
    if (hdrs) for (const k in hdrs) headers.set(k.toLowerCase(), hdrs[k]);
    commit();
    return res;
  };
  res.flushHeaders = () => commit();

  return { res: res as unknown as ServerResponse, response };
}

function toU8(chunk: unknown): Uint8Array {
  if (typeof chunk === "string") return new TextEncoder().encode(chunk);
  return chunk as Uint8Array; // Buffer is a Uint8Array
}

/**
 * Bridge a {@link AppLike} (an `Application(...)`) to a Web `fetch` handler. The
 * Node request listener is built once; each call shims a `Request` through it and
 * returns a streaming `Response`. Use it with `Bun.serve`, `Deno.serve`, a
 * Cloudflare Worker `export default { fetch }`, etc.
 */
export function toFetchHandler(app: AppLike): FetchHandler {
  const listener = app.handler();
  return async (request: Request): Promise<Response> => {
    const req = await toNodeRequest(request);
    const { res, response } = makeNodeResponse();
    listener(req, res);
    return response;
  };
}

// ── runtime adapters ────────────────────────────────────────────────────────────

export interface ServeOptions {
  port?: number;
  hostname?: string;
}

export interface RunningServer {
  /** Adapter that bound it (node / bun / deno). */
  runtime: string;
  /** The base URL it is reachable at. */
  url: string;
  /** Stop accepting connections. */
  close(): Promise<void> | void;
}

/** A way to run an app on a specific host runtime. */
export interface RuntimeAdapter {
  name: string;
  /** Is this runtime the one we're executing in? */
  available(): boolean;
  serve(app: AppLike, opts?: ServeOptions): Promise<RunningServer>;
}

const g = globalThis as unknown as {
  Bun?: { serve(o: { port?: number; hostname?: string; fetch: FetchHandler }): { port: number; hostname: string; stop(): void } };
  Deno?: { serve(o: { port?: number; hostname?: string; signal?: AbortSignal }, h: FetchHandler): { finished: Promise<void> } };
};

/** node:http — uses the app's Node listener directly (no fetch shim needed). */
export const nodeAdapter: RuntimeAdapter = {
  name: "node",
  available: () => !g.Bun && !g.Deno,
  async serve(app, opts = {}) {
    const server = createServer(app.handler());
    const port = opts.port ?? 3000;
    await new Promise<void>((resolve) => server.listen(port, opts.hostname, resolve));
    return {
      runtime: "node",
      url: `http://${opts.hostname ?? "localhost"}:${port}`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  },
};

/** Bun — `Bun.serve({ fetch })` over the fetch bridge. */
export const bunAdapter: RuntimeAdapter = {
  name: "bun",
  available: () => !!g.Bun,
  async serve(app, opts = {}) {
    const server = g.Bun!.serve({ port: opts.port ?? 3000, hostname: opts.hostname, fetch: toFetchHandler(app) });
    return {
      runtime: "bun",
      url: `http://${server.hostname}:${server.port}`,
      close: () => server.stop(),
    };
  },
};

/** Deno — `Deno.serve(fetch)` over the fetch bridge. */
export const denoAdapter: RuntimeAdapter = {
  name: "deno",
  available: () => !!g.Deno,
  async serve(app, opts = {}) {
    const ac = new AbortController();
    const port = opts.port ?? 3000;
    g.Deno!.serve({ port, hostname: opts.hostname, signal: ac.signal }, toFetchHandler(app));
    return {
      runtime: "deno",
      url: `http://${opts.hostname ?? "localhost"}:${port}`,
      close: () => ac.abort(),
    };
  },
};

const ADAPTERS = [bunAdapter, denoAdapter, nodeAdapter];

/** The adapter for the runtime we're executing in (Bun → Deno → Node fallback). */
export function detectAdapter(): RuntimeAdapter {
  return ADAPTERS.find((a) => a.available()) ?? nodeAdapter;
}

/**
 * Serve `app` on whatever runtime we're in — one line that works on Node, Bun and
 * Deno. Returns a handle with the bound `url` and a `close()`.
 */
export function serve(app: AppLike, opts?: ServeOptions): Promise<RunningServer> {
  return detectAdapter().serve(app, opts);
}
