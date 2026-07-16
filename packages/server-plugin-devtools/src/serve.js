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
import { Response } from "@youneed/server";
import { fromApp } from "./core.js";
// The prebuilt UI bundle (dist/web/client.js), read once. Missing → a friendly stub.
let cachedClient = null;
function clientJs() {
    if (cachedClient !== null)
        return cachedClient;
    // dist/serve.js → ./web/client.js (built); src/serve.ts (tsx) → ../dist/web/client.js.
    for (const rel of ["./web/client.js", "../dist/web/client.js"]) {
        try {
            cachedClient = readFileSync(new URL(rel, import.meta.url), "utf8");
            return cachedClient;
        }
        catch {
            /* try the next candidate */
        }
    }
    cachedClient =
        'document.body.textContent = "server-devtools UI not built — run: pnpm --filter @youneed/server-plugin-devtools build:web";';
    return cachedClient;
}
const page = (path) => `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>server-devtools</title>
<style>
/* Consume shad's theme vars (injected at document level by the bundle) so the
   WHOLE page — not just the component's shadow DOM — follows the .dark toggle. */
body{margin:0;min-height:100vh;font-family:system-ui,sans-serif;background:hsl(var(--background,0 0% 100%));color:hsl(var(--foreground,240 10% 3.9%))}
.w{max-width:none;margin:0;padding:24px}h1{font-size:22px;margin:0 0 16px}
</style>
</head><body><div class="w"><h1>Server devtools</h1><server-devtools></server-devtools></div>
<script type="module" src=${JSON.stringify(`${path}/client.js`)}></script>
</body></html>`;
/**
 * Mount the devtools UI + live-topology endpoint on `app`. Returns `app` for
 * chaining. Open `{path}` in a browser to inspect the running server.
 */
export function serveDevtools(app, opts = {}) {
    const path = opts.path ?? "/__devtools";
    const meta = { name: opts.name ?? "server", url: opts.url, middleware: opts.middleware };
    // The UI expects a ServerTopology (`{ servers: [...] }`), not a bare ServerInfo.
    // The devtools' own routes (under `path`) are flagged `internal` → shown in the
    // topology but skipped by the security audit.
    const underDevtools = (p) => p === path || p.startsWith(`${path}/`);
    app.get(`${path}/topology.json`, () => {
        const server = fromApp(app, meta);
        const routes = server.routes.map((r) => (underDevtools(r.path) ? { ...r, internal: true } : r));
        return Response.json({ servers: [{ ...server, routes }] });
    });
    // "Try a guard" — run a route's guards against synthetic input (no handler) and
    // report each verdict. Lets the devtools UI probe guard behavior from a form.
    app.post(`${path}/try-guard`, async (ctx) => {
        const req = (ctx.body ?? {});
        if (!req.method || !req.path)
            return Response.json({ error: "method and path are required" }, { status: 400 });
        const trials = await app.tryGuards(req.method, req.path, {
            headers: req.headers,
            params: req.params,
            query: req.query,
            body: req.body,
        });
        return Response.json({ trials });
    });
    app.get(`${path}/client.js`, () => Response({ headers: { "Content-Type": "text/javascript; charset=utf-8" }, body: clientJs() }));
    app.get(path, () => Response({ headers: { "Content-Type": "text/html; charset=utf-8" }, body: page(path) }));
    return app;
}
/**
 * A first-class `@youneed/server` {@link ServerPlugin} that mounts the devtools
 * UI + live-topology endpoint, so you register it the idiomatic way:
 *
 *   app.plugin(devtools({ path: "/__devtools" }));
 *
 * `setup(app)` reuses {@link serveDevtools} to add the same three routes under
 * `path` (default `/__devtools`). DEV-ONLY: it exposes your full route topology
 * and schemas — only register it in development, or behind auth.
 */
export function devtools(opts = {}) {
    return {
        name: "devtools",
        setup(app) {
            serveDevtools(app, opts);
        },
    };
}
