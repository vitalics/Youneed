// @youneed/server — runs on node via tsx.
import { Application, Response } from "../../src/server.ts";
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

Application()
  .get("/health", () => Response.json({ ok: true }))
  .get("/text", () => Response.text(HELLO))
  .get("/json", () => Response.json(JSON_PAYLOAD))
  .listen(PORT, () => console.log(`[ours] listening on ${PORT}`));
