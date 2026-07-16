// Express — the ubiquitous node baseline. Runs on node.
import express from "express";
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/text", (_req, res) => res.type("text/plain").send(HELLO));
app.get("/json", (_req, res) => res.json(JSON_PAYLOAD));
app.listen(PORT, () => console.log(`[express] listening on ${PORT}`));
