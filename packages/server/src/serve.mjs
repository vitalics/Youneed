// Tiny zero-dependency static server.
// Usage: node src/serve.mjs [dir] [--spa]   (PORT env optional, default 8080)
//   --spa: fall back to index.html for extensionless paths (history-mode SPA
//          deep links like /users/1 on refresh).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dirArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const spa = process.argv.includes("--spa");
// Serve the directory passed as an argument, else this file's own directory.
const dir = dirArg ? resolve(process.cwd(), dirArg) : fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT) || 8080;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  if (pathname === "/") pathname = "/index.html";
  // keep the request inside `dir`
  const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = join(dir, safe);

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    // SPA fallback: an extensionless path is a client route → serve index.html.
    if (spa && extname(file) === "") {
      try {
        const html = await readFile(join(dir, "index.html"));
        res.writeHead(200, { "Content-Type": types[".html"] });
        res.end(html);
        return;
      } catch {
        /* no index.html — fall through to 404 */
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`serving ${dir} on http://localhost:${port}`);
});
