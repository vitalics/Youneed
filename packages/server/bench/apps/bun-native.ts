// Bun native — Bun.serve with the WHATWG fetch handler. Runs ONLY under `bun`
// (the orchestrator skips it when `bun` isn't on PATH). `Response` here is the
// Bun/WHATWG global, not @youneed/server's.
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

// @ts-ignore — Bun is a runtime global, not present under the node typecheck.
Bun.serve({
  port: PORT,
  fetch(req: Request) {
    const path = new URL(req.url).pathname;
    if (path === "/json") return Response.json(JSON_PAYLOAD);
    if (path === "/text")
      return new Response(HELLO, { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (path === "/health") return Response.json({ ok: true });
    return new Response(null, { status: 404 });
  },
});
console.log(`[bun-native] listening on ${PORT}`);
