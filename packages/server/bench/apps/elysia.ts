// Elysia — Bun-first, but runs on node via the @elysiajs/node adapter. The
// orchestrator runs this under tsx (node). Same three routes as the others.
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

new Elysia({ adapter: node() })
  .get("/health", () => ({ ok: true }))
  .get("/text", ({ set }) => {
    set.headers["content-type"] = "text/plain; charset=utf-8";
    return HELLO;
  })
  .get("/json", () => JSON_PAYLOAD)
  .listen(PORT, () => console.log(`[elysia] listening on ${PORT}`));
