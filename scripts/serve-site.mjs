// Local static preview of the BUILT site (site/dist) — zero dependencies.
// Run `pnpm site:build` first; use `pnpm site:dev` for the live dev server.
//   pnpm site:serve            → http://localhost:4173
//   PORT=8080 pnpm site:serve
//   OPEN=/index-brutalist.html,/index-atmospheric.html pnpm site:serve  → also opens tabs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "site", "dist");
const PORT = Number(process.env.PORT) || 4173;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path.endsWith("/")) path += "index.html";
  else if (!extname(path)) path += "/index.html"; // /docs → /docs/index.html (dir index)
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, "")); // no path traversal
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404 Not Found");
  }
}).listen(PORT, () => {
  console.log(`site → http://localhost:${PORT}  (landing: /, docs: /docs)`);
  const opener = { darwin: "open", win32: "start" }[process.platform] ?? "xdg-open";
  for (const path of (process.env.OPEN ?? "").split(",").filter(Boolean)) {
    spawn(opener, [`http://localhost:${PORT}${path}`], { stdio: "ignore", detached: true }).unref();
  }
});
