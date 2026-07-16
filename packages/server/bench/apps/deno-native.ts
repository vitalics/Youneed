// Deno native — Deno.serve with the WHATWG fetch handler. Runs ONLY under `deno`
// (the orchestrator skips it when `deno` isn't on PATH). `Response` here is the
// Deno/WHATWG global, not @youneed/server's.
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

// @ts-ignore — Deno is a runtime global, not present under the node typecheck.
Deno.serve({ port: PORT, onListen: () => console.log(`[deno-native] listening on ${PORT}`) }, (req: Request) => {
  const path = new URL(req.url).pathname;
  if (path === "/json") return Response.json(JSON_PAYLOAD);
  if (path === "/text")
    return new Response(HELLO, { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (path === "/health") return Response.json({ ok: true });
  return new Response(null, { status: 404 });
});
