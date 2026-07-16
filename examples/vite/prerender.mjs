// SSG/SSR render. Run with tsx so our component's TC39 decorators are lowered:
//   node --import tsx examples/vite/prerender.mjs
// Produces examples/vite/dist-ssg/{index.html, hydrate.js}.
// Serve with: node src/serve.mjs examples/vite/dist-ssg
//
// Two render paths, by necessity:
//   • React + Vue  → Vite SSR loader (compiles .tsx/.vue).
//   • our component→ tsx-transformed import (Vite's SSR transform skips decorators).

import { build, createServer } from "vite";
import { registerDOM } from "@youneed/dom/register";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const configFile = resolve(root, "vite.config.ts");
const outDir = resolve(root, "dist-ssg");

// 1) Client hydration bundle (Vite compiles .tsx + .vue).
await build({
  root,
  configFile,
  logLevel: "warn",
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, "src/hydrate.ts"),
      output: { entryFileNames: "hydrate.js", chunkFileNames: "[name].js", assetFileNames: "[name][extname]" },
    },
  },
});

// 2) React + Vue via Vite's SSR loader. Done (and Vite closed) BEFORE happy-dom
//    is registered, so the global DOM never interferes with Vite or React SSR.
const vite = await createServer({ root, configFile, appType: "custom", logLevel: "warn", server: { middlewareMode: true } });
const { renderFrameworks, STARTS } = await vite.ssrLoadModule("/src/ssr.ts");
const { reactHtml, vueHtml } = await renderFrameworks();
await vite.close();

// 3) Our island's Declarative Shadow DOM, via tsx (transforms the decorators).
//    Like the React/Vue cards, it wraps <dom-stepper> and mirrors its value.
registerDOM();
const { renderToString: domRender } = await import("@youneed/ssr");
await import("./src/our-island.ts"); // registers <our-island> + <dom-stepper>
const host = document.createElement("our-island");
host.setAttribute("start", String(STARTS.ours));
const oursHtml = domRender(host);

// 4) Compose + write.
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), shell(reactHtml, vueHtml, oursHtml));
console.log("wrote", resolve(outDir, "index.html"));
process.exit(0);

function shell(reactHtml, vueHtml, oursHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vite × React × Vue × our WC (SSR/SSG)</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 980px; color: #18181b; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .card { border: 1px solid #e4e4e7; border-radius: 12px; padding: 14px 16px; }
  .card h3 { margin: 0 0 6px; }
</style>
</head>
<body>
<h1>Server-rendered, then hydrated — three frameworks</h1>
<p>This whole page is HTML before any JS runs. <code>/hydrate.js</code> then
   hydrates React &amp; Vue and upgrades the custom elements.</p>
<div class="grid">
  <div id="react">${reactHtml}</div>
  <div id="vue">${vueHtml}</div>
  <div class="card">${oursHtml}</div>
</div>
<script type="module" src="/hydrate.js"></script>
</body>
</html>
`;
}
