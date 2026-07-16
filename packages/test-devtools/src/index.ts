// @youneed/test-devtools — a live web-UI reporter for @youneed/test. It boots a
// tiny HTTP server (built on @youneed/server) that serves a single self-contained
// page and streams the run over Server-Sent Events, so you can watch suites,
// tests, statuses, durations, errors, steps and annotations update in real time.
//
//   import { TestApplication } from "@youneed/test";
//   import { DevtoolsReporter } from "@youneed/test-devtools";
//   await TestApplication().addTests(MyTest).reporter(new DevtoolsReporter({ open: true })).run();
//
// On the first event it prints e.g. `youneed test devtools → http://127.0.0.1:54231`.
// With `persist: true` (default) the server stays up after the run so you can keep
// inspecting; call `reporter.close()` (or run with `persist: false`) to stop it.

import {
  Reporter,
  type ProgressEvent,
  type RunSummary,
  type SuiteInfo,
  type TestContext,
  type TestResult,
} from "@youneed/test";
import { Application, Response, type HTTP, type SseHandlers } from "@youneed/server";
import { PAGE } from "./page.ts";

/** A reporter event as it is buffered and streamed to the browser. The `error`
 *  on a TestResult is flattened to a plain object so it survives JSON. */
interface WireEvent {
  event: string;
  payload: unknown;
}

/** The minimal surface we use from `@youneed/server`'s private SseConnection. */
interface SseConn {
  readonly closed: boolean;
  send(event: { data: unknown; event?: string; id?: string } | string): void;
  close(): void;
}

export interface DevtoolsReporterOptions {
  /** Port to listen on. `0` (default) picks a random free port; the real URL is
   *  printed to the console once the server is ready. */
  port?: number;
  /** Bind address (default `"127.0.0.1"`). */
  host?: string;
  /** Open the UI in the default browser when the server is ready (default `false`).
   *  Best-effort and platform-aware — never throws if no opener is available. */
  open?: boolean;
  /** Keep the server alive after `onRunEnd` so the report stays viewable
   *  (default `true`). With `false` the server is closed when the run ends — use
   *  it for one-shot/CI runs so the process can exit. */
  persist?: boolean;
}

// `Error` is not JSON-serializable; flatten it the same way @youneed/test's
// encodeResult does (name/message/stack) so the browser can render it.
function encodeError(err: unknown): { name: string; message: string; stack?: string } | undefined {
  if (!err) return undefined;
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { name: "Error", message: String(err) };
}

/** Make a TestResult safe to JSON-stringify (its `error` is an Error instance). */
function encodeResult(r: TestResult): unknown {
  return { ...r, error: encodeError(r.error) };
}

/** Pick the payload shape we actually want to ship for a given event. */
function encodePayload(event: string, payload: unknown): unknown {
  if (event === "onTestEnd" && payload && typeof payload === "object" && "status" in payload) {
    return encodeResult(payload as TestResult);
  }
  if (event === "onTestStart" && payload && typeof payload === "object") {
    // TestContext carries live, non-serializable bits (Map, AbortSignal, methods).
    const c = payload as TestContext;
    return { suite: c.suite, name: c.name, run: c.run };
  }
  return payload;
}

/** Reserve a free TCP port by briefly listening on `:0`, then releasing it. The
 *  tiny window between release and re-bind is the standard ephemeral-port pattern
 *  and is acceptable for a dev tool. */
async function freePort(host: string): Promise<number> {
  const net = await import("node:net");
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

/** Best-effort "open this URL in the browser", per platform. Never throws. */
async function openBrowser(url: string): Promise<void> {
  try {
    const { spawn } = await import("node:child_process");
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32", // `start` is a shell builtin
    });
    child.on("error", () => {}); // no opener installed → ignore
    child.unref();
  } catch {
    /* opening the browser is a nicety, never fatal */
  }
}

/**
 * Live web-UI reporter. Boots a server lazily on the first event, buffers the
 * whole event stream, and pushes every event to connected browsers over SSE. A
 * client that connects late first receives the buffered backlog, then live events.
 */
export class DevtoolsReporter extends Reporter({ name: "devtools" }) {
  #opts: Required<Omit<DevtoolsReporterOptions, "port">> & { port: number };
  #buffer: WireEvent[] = [];
  #clients = new Set<SseConn>();
  #http?: HTTP;
  #starting?: Promise<void>;
  #url = "";
  #closed = false;

  constructor(opts: DevtoolsReporterOptions = {}) {
    super();
    this.#opts = {
      port: opts.port ?? 0,
      host: opts.host ?? "127.0.0.1",
      open: opts.open ?? false,
      persist: opts.persist ?? true,
    };
  }

  /** The URL the UI is served at (empty until the server has started). */
  get url(): string {
    return this.#url;
  }

  // ── lifecycle events: buffer + broadcast every one ──────────────────────────
  @Reporter.event("onRunStart") async onRunStart() {
    await this.#ensureServer();
    this.#push("onRunStart", undefined);
  }
  @Reporter.event("onSuiteStart") onSuiteStart(i: SuiteInfo) {
    this.#push("onSuiteStart", i);
  }
  @Reporter.event("onTestStart") onTestStart(ctx: TestContext) {
    this.#push("onTestStart", ctx);
  }
  @Reporter.event("onTestEnd") onTestEnd(r: TestResult) {
    this.#push("onTestEnd", r);
  }
  @Reporter.event("onSuiteEnd") onSuiteEnd(i: SuiteInfo) {
    this.#push("onSuiteEnd", i);
  }
  @Reporter.event("onProgress") onProgress(p: ProgressEvent) {
    this.#push("onProgress", p);
  }
  @Reporter.event("onRunEnd") async onRunEnd(s: RunSummary) {
    // RunSummary.results carry Error instances — encode them for the wire.
    this.#push("onRunEnd", { ...s, results: s.results.map(encodeResult) });
    if (!this.#opts.persist) await this.close();
  }

  /** Stop the server and disconnect every SSE client. Idempotent. */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const c of this.#clients) {
      try {
        c.close();
      } catch {
        /* a client may already be gone */
      }
    }
    this.#clients.clear();
    await this.#http?.close().catch(() => {});
    this.#http = undefined;
  }

  // ── internals ───────────────────────────────────────────────────────────────
  #encode(event: string, payload: unknown): WireEvent {
    return { event, payload: encodePayload(event, payload) };
  }

  #push(event: string, payload: unknown): void {
    const wire = this.#encode(event, payload);
    this.#buffer.push(wire);
    const frame = JSON.stringify(wire);
    for (const c of this.#clients) {
      if (c.closed) this.#clients.delete(c);
      else c.send(frame);
    }
  }

  async #ensureServer(): Promise<void> {
    if (this.#http || this.#starting) return this.#starting ?? Promise.resolve();
    this.#starting = this.#start();
    return this.#starting;
  }

  async #start(): Promise<void> {
    const host = this.#opts.host;
    const port = this.#opts.port || (await freePort(host));

    const sse: SseHandlers = {
      open: (conn) => {
        const client = conn as unknown as SseConn;
        // Replay everything that happened before this client connected.
        for (const ev of this.#buffer) client.send(JSON.stringify(ev));
        this.#clients.add(client);
        // Returning a non-streamable value keeps the socket open (the server
        // only auto-closes when `open` returns an AsyncIterable).
        return undefined;
      },
      close: (conn) => {
        this.#clients.delete(conn as unknown as SseConn);
      },
    };

    const app = Application()
      .get("/", Response({ headers: { "Content-Type": "text/html; charset=utf-8" }, body: PAGE }))
      .sse("/events", sse);

    await new Promise<void>((resolve) => {
      this.#http = app.listen(port, { host }, () => resolve());
    });

    this.#url = `http://${host}:${port}`;
    console.log(`youneed test devtools → ${this.#url}`);
    if (this.#opts.open) await openBrowser(this.#url);
  }
}
