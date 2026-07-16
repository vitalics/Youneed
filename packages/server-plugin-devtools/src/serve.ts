// ── @youneed/server-plugin-devtools/serve — mount the devtools web UI on a live app ─
//
// A programmatic API: point it at a running `@youneed/server` app and it mounts a
// devtools endpoint that serves the web UI wired to the app's LIVE topology
// (`app.topology()`) — security audit, OpenAPI and microbench included.
//
// Two ways to wire it up:
//
//   // 1) As a first-class server plugin (preferred):
//   import { Application } from "@youneed/server";
//   import { devtools } from "@youneed/server-plugin-devtools/serve";
//
//   const app = Application().use(cors()).plugin(devtools({ name: "users-api", path: "/__devtools" }));
//   app.listen(3000, () => {});   // open http://localhost:3000/__devtools
//
//   // 2) Imperatively on a live app:
//   import { serveDevtools } from "@youneed/server-plugin-devtools/serve";
//   const app = Application().use(cors()).get("/users", …) /* … */;
//   serveDevtools(app, { name: "users-api", middleware: ["cors", "helmet", "rate-limit"] });
//   app.listen(3000, () => {});   // open http://localhost:3000/__devtools
//
// It registers three routes under `path` (default `/__devtools`):
//   GET {path}               → the UI page
//   GET {path}/topology.json → the live topology (JSON)
//   GET {path}/client.js     → the prebuilt UI bundle
//
// DEV-ONLY: the devtools endpoint exposes your full route topology + schemas.
// Mount it only in development (e.g. guard the `app.plugin(devtools())` call
// behind `process.env.NODE_ENV !== "production"`), or behind auth.
//
// The UI bundle ships in this package's `dist/web` (built via `build:web`).

import { readFileSync } from "node:fs";
import { Response, type AppBuilder, type ServerPlugin } from "@youneed/server";
import { serveProtocol } from "./protocol.ts";
import type { Domain } from "@youneed/devtools-protocol";

// The HTTP surface we need from the app — `@youneed/server`'s AppBuilder satisfies it.
type ServeApp = {
  get(path: string, handler: () => unknown): unknown;
};

export interface ServeDevtoolsOptions {
  /** Mount prefix (default `/__devtools`). */
  path?: string;
  /** Display name for this server in the UI. */
  name?: string;
  /** Public URL of this server (shown + used in the OpenAPI `servers`). */
  url?: string;
  /** The security-relevant middleware you mounted (e.g. `["cors", "helmet",
   *  "rate-limit"]`) — overrides the app's best-effort names so the audit is
   *  accurate (mounted middleware are anonymous functions; names can't be inferred). */
  middleware?: string[];
  /** Mount the `Network` request-waterfall tap (global middleware). Default `true`. */
  network?: boolean;
  /** Extra protocol domains to register on the server target (e.g. `ssrDomain(...)`). */
  domains?: Domain[];
}

// The prebuilt UI bundle (dist/web/client.js). Read FRESH each request — it's a
// dev tool, so a rebuilt bundle is served without restarting the server.
function clientJs(): string {
  // dist/serve.js → ./web/client.js (built); src/serve.ts (tsx) → ../dist/web/client.js.
  for (const rel of ["./web/client.js", "../dist/web/client.js"]) {
    try {
      return readFileSync(new URL(rel, import.meta.url), "utf8");
    } catch {
      /* try the next candidate */
    }
  }
  return 'document.body.textContent = "server-devtools UI not built — run: pnpm --filter @youneed/server-plugin-devtools build:web";';
}

// The devtools page — mounts the unified <youneed-devtools> shell, which discovers
// targets at `{path}/json` and drives them over @youneed/devtools-protocol.
const page = (path: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>youneed devtools</title>
<style>body{margin:0;min-height:100vh;font-family:system-ui,sans-serif}</style>
</head><body>
<youneed-devtools discovery=${JSON.stringify(`${path}/json`)}></youneed-devtools>
<script type="module" src=${JSON.stringify(`${path}/client.js`)}></script>
</body></html>`;

/**
 * Mount the devtools UI (the unified protocol shell) on `app`. Serves the page +
 * the prebuilt bundle; the protocol endpoints (`/json`, `/ws`, `/register`) are
 * mounted by {@link serveProtocol}. Returns `app` for chaining.
 */
export function serveDevtools<A extends ServeApp>(app: A, opts: ServeDevtoolsOptions = {}): A {
  const path = opts.path ?? "/__devtools";
  // `no-store` so a rebuilt bundle is always picked up (dev tool — never cache).
  const noStore = "no-store, max-age=0";
  app.get(`${path}/client.js`, () =>
    Response({ headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": noStore }, body: clientJs() }),
  );
  app.get(path, () => Response({ headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": noStore }, body: page(path) }));
  return app;
}

// ── server plugin ────────────────────────────────────────────────────────────────

/** Options for the {@link devtools} server plugin — the same knobs as
 *  {@link serveDevtools} (mount `path`, display `name`, public `url`, and the
 *  security-relevant `middleware` names). */
export type DevtoolsPluginOptions = ServeDevtoolsOptions;

/**
 * A first-class `@youneed/server` {@link ServerPlugin} mounting the devtools UI +
 * the CDP-style protocol (`@youneed/devtools-protocol`), idiomatically:
 *
 *   app.plugin(devtools({ path: "/__devtools" }));
 *
 * `setup(app)` serves the unified shell ({@link serveDevtools}) and the protocol
 * endpoints ({@link serveProtocol}: `/json`, `/ws`, `/register` + the Topology /
 * Network / Log domains). DEV-ONLY: it exposes your full topology — only register
 * it in development, or behind auth.
 */
export function devtools(opts: DevtoolsPluginOptions = {}): ServerPlugin {
  return {
    name: "devtools",
    setup(app: AppBuilder): void {
      serveDevtools(app, opts);
      serveProtocol(app as never, {
        path: opts.path,
        name: opts.name,
        url: opts.url,
        middleware: opts.middleware,
        domains: opts.domains,
        network: opts.network,
      });
    },
  };
}
