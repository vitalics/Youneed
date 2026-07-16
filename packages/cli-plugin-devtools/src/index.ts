// @youneed/cli-plugin-devtools — a devtools server for @youneed/cli.
//
//   Application({ name: "ops", commands: [...], plugins: [devtools()] });
//   // then:  ops devtools   →   http://127.0.0.1:7331
//
// The plugin registers a `devtools` command that serves the SAME unified
// <youneed-devtools> shell the server devtools serves (`@youneed/devtools-protocol`):
// a tab per advertised domain, styled with shad components — so a CLI's devtools
// looks identical to a server's. The `CLI` domain (./protocol.ts) exposes the
// command/option catalogue + a run; ./ext.ts renders it as a shad builder form
// (fill in args/options, Copy or Run). It speaks the protocol over a tiny built-in
// WebSocket (./ws.ts) — nothing leaves localhost.
//
// Pass `legacy: true` for the original zero-dependency hand-rolled page (no shell,
// no bundle) — still served by {@link requestHandler} below.

import { readFileSync } from "node:fs";
import { Command, type CliPlugin } from "@youneed/cli";
import { createCatalog, type Catalog } from "./catalog.ts";
import { renderPage } from "./page.ts";
import { createCliTarget } from "./protocol.ts";
import { serveWebSocket } from "./ws.ts";

export {
  createCatalog,
  assembleCommand,
  toArgv,
  quoteArg,
  type Catalog,
  type CatalogCommand,
  type CatalogOption,
  type CatalogArg,
  type CommandValues,
} from "./catalog.ts";
export { renderPage } from "./page.ts";
export { cliDomain, createCliTarget, type CliDomainOptions } from "./protocol.ts";
export { serveWebSocket } from "./ws.ts";

/** Options for {@link devtools}. */
export interface DevtoolsOptions {
  /** Port to listen on. Default 7331. */
  port?: number;
  /** Hostname to bind. Default `127.0.0.1` (localhost only). */
  host?: string;
  /** Name of the command this plugin registers. Default `devtools`. */
  command?: string;
  /** Allow the Run button (spawns the CLI). Default true. */
  run?: boolean;
  /** argv prefix used to launch the CLI for Run. Default `process.argv.slice(0, 2)`. */
  launcher?: string[];
  /** Kill a Run that exceeds this many ms. Default 8000. */
  runTimeoutMs?: number;
  /** Serve the original hand-rolled page instead of the unified shell. Default false. */
  legacy?: boolean;
}

/** Minimal request/response shapes (a subset of node:http) for the handler. */
export interface DevtoolsRequest {
  method?: string;
  url?: string;
  on?(event: "data" | "end", listener: (chunk?: unknown) => void): unknown;
  [Symbol.asyncIterator]?(): AsyncIterator<unknown>;
}
export interface DevtoolsResponse {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body?: string): unknown;
}

function send(res: DevtoolsResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

async function readBody(req: DevtoolsRequest): Promise<string> {
  if (typeof req[Symbol.asyncIterator] === "function") {
    let body = "";
    for await (const chunk of req as AsyncIterable<unknown>) body += String(chunk);
    return body;
  }
  return "";
}

async function runCommand(opts: DevtoolsOptions, argv: string[]): Promise<{ code: number | null; output: string }> {
  const launcher = opts.launcher ?? process.argv.slice(0, 2);
  const [bin, ...prefix] = [...launcher, ...argv];
  if (!bin) return { code: null, output: "no launcher" };
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(bin, prefix, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill(), opts.runTimeoutMs ?? 8000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, output: String(err) });
    });
  });
}

/**
 * Build the LEGACY request handler for a catalogue — exported for testing and the
 * `legacy: true` opt-in. Serves the hand-rolled page (`GET /`), the catalogue JSON
 * (`GET /catalog`), and runs commands (`POST /run`) unless `run` is disabled.
 */
export function requestHandler(
  catalog: Catalog,
  opts: DevtoolsOptions = {},
): (req: DevtoolsRequest, res: DevtoolsResponse) => void {
  const allowRun = opts.run !== false;
  const html = renderPage(catalog, allowRun);
  return (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && url === "/") return send(res, 200, "text/html; charset=utf-8", html);
    if (req.method === "GET" && url === "/catalog") return send(res, 200, "application/json", JSON.stringify(catalog));
    if (req.method === "POST" && url === "/run") {
      if (!allowRun) return send(res, 403, "application/json", JSON.stringify({ error: "running is disabled" }));
      void readBody(req).then((body) => {
        let argv: string[] = [];
        try {
          argv = (JSON.parse(body) as { argv?: string[] }).argv ?? [];
        } catch {
          /* ignore bad body */
        }
        void runCommand(opts, argv).then((result) => send(res, 200, "application/json", JSON.stringify(result)));
      });
      return;
    }
    send(res, 404, "text/plain", "Not found");
  };
}

// ── unified shell (the default — matches the server devtools styling) ──────────

/** The prebuilt UI bundle (dist/web/client.js). Read FRESH each request — it's a
 *  dev tool, so a rebuilt bundle is served without restarting the CLI. */
function clientJs(): string {
  // dist/index.js → ./web/client.js (built); src/index.ts (tsx) → ../dist/web/client.js.
  for (const rel of ["./web/client.js", "../dist/web/client.js"]) {
    try {
      return readFileSync(new URL(rel, import.meta.url), "utf8");
    } catch {
      /* try the next candidate */
    }
  }
  return 'document.body.textContent = "cli-devtools UI not built — run: pnpm --filter @youneed/cli-plugin-devtools build:web";';
}

/** The devtools page — mounts the unified <youneed-devtools> shell, which discovers
 *  the CLI target at `/json` and drives it over @youneed/devtools-protocol. */
const shellPage = (name: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} devtools</title>
<style>body{margin:0;min-height:100vh;font-family:system-ui,sans-serif}</style>
</head><body>
<youneed-devtools discovery="/json"></youneed-devtools>
<script type="module" src="/client.js"></script>
</body></html>`;

/**
 * The devtools plugin. Registers a `devtools` command that starts the server and
 * serves the unified shell (or, with `legacy: true`, the original page).
 */
export function devtools(opts: DevtoolsOptions = {}): CliPlugin {
  const commandName = opts.command ?? "devtools";
  return {
    name: "devtools",
    setup(host) {
      class Devtools extends Command(commandName, {
        description: "Start the devtools server (command/option explorer + builder)",
      }) {
        override async execute(): Promise<void> {
          const { createServer } = await import("node:http");
          const port = opts.port ?? 7331;
          const hostname = opts.host ?? "127.0.0.1";

          let server: import("node:http").Server;
          let detachWs: (() => void) | undefined;
          let count: number;

          if (opts.legacy) {
            const catalog = createCatalog(host, { exclude: commandName });
            count = catalog.commands.length;
            server = createServer(requestHandler(catalog, opts) as never);
          } else {
            // The CLI target speaks the same protocol the server devtools speaks;
            // the bundled shell discovers it at /json and drives it over /ws.
            const target = createCliTarget(host, {
              title: host.name,
              exclude: commandName,
              run: opts.run,
              launcher: opts.launcher,
              runTimeoutMs: opts.runTimeoutMs,
            });
            count = createCatalog(host, { exclude: commandName }).commands.length;
            server = createServer((req, res) => {
              const url = (req.url ?? "/").split("?")[0];
              if (url === "/client.js") {
                res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store, max-age=0" });
                return res.end(clientJs());
              }
              if (url === "/json") {
                res.writeHead(200, { "content-type": "application/json" });
                return res.end(JSON.stringify([{ ...target.info(), webSocketDebuggerUrl: "/ws" }]));
              }
              if (url === "/") {
                res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" });
                return res.end(shellPage(host.name));
              }
              res.writeHead(404, { "content-type": "text/plain" });
              res.end("Not found");
            });
            detachWs = serveWebSocket(server, "/ws", (transport) => target.serve(transport));
          }

          await new Promise<void>((resolve) => server.listen(port, hostname, () => resolve()));
          console.log(`devtools running at http://${hostname}:${port} — ${count} commands`);
          // Stay up until graceful shutdown (SIGINT/SIGTERM) aborts the run.
          await new Promise<void>((resolve) => {
            if (this.abortSignal.aborted) return resolve();
            this.abortSignal.addEventListener("abort", () => resolve(), { once: true });
          });
          detachWs?.();
          server.close();
        }
      }
      host.addCommand(Devtools);
    },
  };
}
