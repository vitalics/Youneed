// The @youneed/server app under benchmark. Run on node via tsx:
//   node --import tsx app.ts
// bench.mjs boots it once and drives hyperfine + curl over each endpoint.
import { Application, Response, File, t, createCache } from "../src/server.ts";
import { HELLO, JSON_PAYLOAD, STATIC_FILE, SSE_EVENTS, PORT } from "./data.mjs";

interface Item {
  id: number;
  name: string;
}
const items = new Map<number, Item>();
let seq = 0;

// Compiled response cache — repeat hits replay precomputed bytes (no handler,
// no serialization). `/json-cached` shows that fast path.
const pageCache = createCache({ ttl: 60_000, compile: true });

Application()
  .use("/json-cached", pageCache.middleware())
  .get("/json-cached", () => Response.json(JSON_PAYLOAD))
  .get("/health", () => Response.json({ ok: true }))
  .get("/text", () => Response.text(HELLO))
  .get("/json", () => Response.json(JSON_PAYLOAD))
  // Same payload, but a response schema engages the compiled serializer.
  .get("/json-typed", () => Response.json(JSON_PAYLOAD), {
    response: t.object({
      message: t.string(),
      items: t.array(t.number()),
      nested: t.object({ ok: t.boolean(), ts: t.string() }),
    }),
  })
  .get("/file", () => File(STATIC_FILE))
  .get("/items", () => Response.json([...items.values()]))
  .post("/items", (ctx) => {
    const id = ++seq;
    const item: Item = { id, name: (ctx.body as any)?.name ?? "" };
    items.set(id, item);
    return Response.json(item, { status: 201 });
  })
  .get("/items/:id", (ctx) => {
    const item = items.get(Number(ctx.params.id));
    return item ? Response.json(item) : Response.json({ error: "not found" }, { status: 404 });
  })
  .put("/items/:id", (ctx) => {
    const item = items.get(Number(ctx.params.id));
    if (!item) return Response.json({ error: "not found" }, { status: 404 });
    item.name = (ctx.body as any)?.name ?? item.name;
    return Response.json(item);
  })
  .delete("/items/:id", (ctx) => {
    items.delete(Number(ctx.params.id));
    return Response({ status: 204 });
  })
  .sse("/sse", {
    async *open() {
      for (let i = 0; i < SSE_EVENTS; i++) yield { data: String(i) };
    },
  })
  // Echo: the bench client connects, sends one frame, awaits the echo, exits.
  .ws("/ws", {
    message: (ws, msg) => ws.send(msg),
  })
  .listen(PORT, () => console.log(`[bench] @youneed/server listening on ${PORT}`));
