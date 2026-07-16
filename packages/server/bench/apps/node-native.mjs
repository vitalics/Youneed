// Node.js native — bare node:http, hand-rolled routing. The framework-free floor.
import { createServer } from "node:http";
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

createServer((req, res) => {
  const url = req.url || "/";
  const qi = url.indexOf("?");
  const path = qi === -1 ? url : url.slice(0, qi);
  if (path === "/json") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(JSON_PAYLOAD)); // stringify per request — fair vs frameworks
  }
  if (path === "/text") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(HELLO);
  }
  if (path === "/health") {
    res.setHeader("Content-Type", "application/json");
    return res.end('{"ok":true}');
  }
  res.statusCode = 404;
  res.end();
}).listen(PORT, () => console.log(`[node-native] listening on ${PORT}`));
