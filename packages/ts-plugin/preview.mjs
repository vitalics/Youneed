// Component preview engine for @youneed/dom + @youneed/ts-plugin. Import it from
// anywhere:
//
//   import { defineComponentPreview, runComponentPreview, serveComponentPreview }
//     from "@youneed/ts-plugin/preview";
//
// Author a config with `defineComponentPreview({...})` and either:
//   • `runComponentPreview(config)`   — render every component to <outDir>/<tag>.png
//                                       (headless Chromium; the editor-hover artifact)
//   • `serveComponentPreview(config)` — a live dev-server: a browser gallery that
//                                       re-bundles + reloads on every save (fast loop)
//
// It parses entries with the plugin's own component index (tags + props + JSDoc),
// bundles them for the browser with esbuild (importing registers the custom
// elements), and renders each component driven by your `generate()` hook.
//
// Shipped as plain ESM (not compiled) so the published plugin stays free of
// @types/node. esbuild / typescript / playwright-core are resolved at runtime from
// the CONSUMER's project (optional peers) — only the modes that use them need them.
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const requireHere = createRequire(import.meta.url);
const requireCwd = createRequire(join(process.cwd(), "_.js"));

// Resolve a peer dep by name: try the consumer's project first, then this package,
// then a pnpm store walked up from cwd (playwright-core is commonly a non-hoisted
// transitive dep in a workspace, so a plain require can miss it).
const dep = (name) => {
  for (const req of [requireCwd, requireHere]) {
    try {
      return req(name);
    } catch {
      /* try the next resolver */
    }
  }
  for (let dir = process.cwd(); ; ) {
    const store = join(dir, "node_modules/.pnpm");
    if (existsSync(store)) {
      const hit = readdirSync(store).find((d) => d.startsWith(`${name}@`));
      if (hit) return requireHere(join(store, hit, "node_modules", name));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`cannot resolve '${name}' — install it in your project (e.g. pnpm add -D ${name})`);
};

// The component index lives in this package's own compiled output.
let _buildComponentIndex;
const buildComponentIndex = (...a) => (_buildComponentIndex ??= requireHere(resolve(here, "dist/component-index.js")).buildComponentIndex)(...a);

/** Identity helper for an editor-typed config (like vite's `defineConfig`). */
export function defineComponentPreview(config) {
  return config;
}

// A sample value for a prop, inferred from its declared/initialised type text.
export const sampleFor = (type = "", tag = "") => {
  const t = type.toLowerCase();
  if (t.includes("number")) return 3;
  if (t.includes("boolean")) return true;
  if (t.includes("string")) return tag.replace(/-/g, " ");
  return undefined;
};

/** Build the tag→component index for the requested entry files (TS program + bind). */
function indexFor(ts, files) {
  const program = ts.createProgram(files, { allowJs: true, target: ts.ScriptTarget.Latest });
  program.getTypeChecker(); // bind: sets node.parent so the index's getStart()/getText() work
  return buildComponentIndex(ts, program.getSourceFiles());
}

const normPath = (p) => p?.replace(/\\/g, "/");

/** Default props for a component: the `generate` spec's, else sampled by type. */
const propsFor = (c, spec) => spec.props ?? Object.fromEntries(c.props.map((p) => [p.name, sampleFor(p.type, c.tag)]).filter(([, v]) => v !== undefined));

/** Run a preview config: render every component it finds and write the PNGs. */
export async function runComponentPreview(config) {
  const esbuild = dep("esbuild");
  const ts = dep("typescript");
  const { chromium } = dep("playwright-core");

  const files = (Array.isArray(config.file) ? config.file : [config.file]).map((f) => resolve(f));
  const outDir = resolve(config.outDir ?? "preview");
  const generate = config.generate ?? (() => ({}));
  const index = indexFor(ts, files);

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch(
    config.executablePath ?? process.env.PW_CHROMIUM_PATH
      ? { executablePath: config.executablePath ?? process.env.PW_CHROMIUM_PATH }
      : {},
  );

  let count = 0;
  try {
    for (const file of files) {
      const components = [...index.values()].filter((c) => normPath(c.fileName) === normPath(file));
      if (!components.length) continue;

      // browser bundle (registers the custom elements). `supported.decorators:false`
      // forces esbuild to LOWER the TC39 decorators — at the default esnext target it
      // leaves `@Component.define()` as-is and the browser can't parse it.
      const { outputFiles } = await esbuild.build({
        entryPoints: [file],
        bundle: true,
        format: "iife",
        platform: "browser",
        write: false,
        logLevel: "silent",
        supported: { decorators: false },
      });

      const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
      await page.setContent("<!doctype html><html><body></body></html>");
      await page.addScriptTag({ content: outputFiles[0].text });

      for (const c of components) {
        const spec = generate(c) || {};
        if (spec.skip) continue;
        const props = propsFor(c, spec);

        await page.evaluate(
          ({ tag, props, html, width }) => {
            document.body.innerHTML = "";
            const wrap = document.createElement("div");
            wrap.id = "preview-wrap";
            wrap.style.cssText = `display:inline-block;padding:12px;background:#fff;font-family:system-ui,sans-serif${width ? `;min-width:${width}px` : ""}`;
            if (html) {
              wrap.innerHTML = html;
            } else {
              const el = document.createElement(tag);
              for (const [k, v] of Object.entries(props)) el[k] = v;
              wrap.appendChild(el);
            }
            document.body.appendChild(wrap);
          },
          { tag: c.tag, props, html: spec.html, width: spec.width },
        );
        await page.waitForTimeout(spec.wait ?? 50); // let the scheduler flush a render
        const wrap = await page.$("#preview-wrap");
        await writeFile(resolve(outDir, `${c.tag}.png`), await wrap.screenshot({ type: "png" }));
        console.log(`✓ ${c.tag} → ${resolve(outDir, `${c.tag}.png`)}`);
        count++;
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (!count) throw new Error(`no @youneed/dom components found in: ${files.join(", ")}`);
  return count;
}

/** Compute the component list + render spec for the live server (pure data, so it
 *  can be sent to the browser as JSON — the `generate` hook runs here, not there). */
function previewListFor(ts, files, generate) {
  const index = indexFor(ts, files);
  const wanted = new Set(files.map(normPath));
  return [...index.values()]
    .filter((c) => wanted.has(normPath(c.fileName)))
    .map((c) => {
      const spec = generate(c) || {};
      return { tag: c.tag, className: c.className, doc: c.doc, see: c.see, skip: !!spec.skip, html: spec.html, width: spec.width, props: propsFor(c, spec) };
    });
}

// The browser gallery shell. It imports the live bundle (which registers the custom
// elements), fetches the component list, mounts each one in a card, and reloads on
// the SSE signal we push after every rebuild. Kept dependency-free and inline.
const GALLERY_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>@youneed/dom — live preview</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #f6f7f9; color: #111; }
  header { position: sticky; top: 0; display: flex; align-items: center; gap: 8px;
           padding: 10px 16px; background: #111; color: #fff; }
  header b { font-weight: 600; } header .dot { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; }
  header .err { margin-left: auto; color: #ff7b72; white-space: pre; font: 12px ui-monospace, monospace; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px; }
  .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px; overflow: hidden; }
  .card h2 { margin: 0; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #eee; display: flex; gap: 8px; align-items: baseline; }
  .card h2 code { color: #1f6feb; } .card h2 span { color: #999; font-weight: 400; }
  .card .doc { padding: 0 12px; margin: 6px 0; color: #666; font-size: 12px; }
  .card .stage { padding: 16px; display: flex; justify-content: center; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; } .card { background: #161b22; border-color: #30363d; }
    .card h2 { border-color: #30363d; } .card h2 span, .card .doc { color: #8b949e; }
  }
</style></head><body>
<header><span class="dot"></span><b>@youneed/dom</b> live preview <span class="err" id="err"></span></header>
<main id="gallery"></main>
<script type="module">
  const err = document.getElementById("err");
  try { await import("/bundle.js"); } catch (e) { err.textContent = String(e); }
  const list = await (await fetch("/components.json")).json();
  const main = document.getElementById("gallery");
  for (const c of list) {
    if (c.skip) continue;
    const card = document.createElement("div"); card.className = "card";
    const h = document.createElement("h2");
    h.innerHTML = '<code>&lt;' + c.tag + '&gt;</code><span>' + c.className + '</span>';
    card.appendChild(h);
    if (c.doc) { const d = document.createElement("p"); d.className = "doc"; d.textContent = c.doc; card.appendChild(d); }
    const stage = document.createElement("div"); stage.className = "stage";
    if (c.width) stage.style.minWidth = c.width + "px";
    if (c.html) { stage.innerHTML = c.html; }
    else { const el = document.createElement(c.tag); for (const [k, v] of Object.entries(c.props)) el[k] = v; stage.appendChild(el); }
    card.appendChild(stage); main.appendChild(card);
  }
  new EventSource("/livereload").onmessage = () => location.reload();
</script></body></html>`;

/**
 * Start a live preview dev-server: open the URL in a browser and every save
 * re-bundles incrementally (esbuild watch) and reloads the page — a real, fast
 * render loop, unlike the PNG/hover path. Same `config` shape as the PNG generator
 * (the `generate` hook still picks props/html/skip/width per component).
 */
export async function serveComponentPreview(config, { port = 5757, host = "127.0.0.1" } = {}) {
  const esbuild = dep("esbuild");
  const ts = dep("typescript");
  const http = await import("node:http");

  const files = (Array.isArray(config.file) ? config.file : [config.file]).map((f) => resolve(f));
  const generate = config.generate ?? (() => ({}));

  let bundleText = "";
  let componentsJson = "[]";
  let buildError = "";
  const clients = new Set();

  // One synthetic entry that imports every file (registers all custom elements).
  const entry = files.map((f) => `import ${JSON.stringify(f)};`).join("\n");

  const reload = {
    name: "preview-reload",
    setup(build) {
      build.onEnd((result) => {
        buildError = result.errors?.length ? result.errors.map((e) => e.text).join("\n") : "";
        // stdin builds emit a single output named `<stdout>`, so take the first.
        const js = result.outputFiles?.[0];
        if (js) bundleText = js.text;
        if (!buildError) {
          try {
            componentsJson = JSON.stringify(previewListFor(ts, files, generate));
          } catch (e) {
            buildError = e?.message ?? String(e);
          }
        }
        for (const res of clients) res.write(`data: ${buildError ? "error" : "reload"}\n\n`);
        console.log(buildError ? `✗ build error\n${buildError}` : `↻ rebuilt ${new Date().toLocaleTimeString()}`);
      });
    },
  };

  const ctx = await esbuild.context({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts", sourcefile: "preview-entry.ts" },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
    supported: { decorators: false }, // lower TC39 decorators so the browser can parse them
    plugins: [reload],
  });
  await ctx.rebuild(); // initial build (fires onEnd → fills bundle + component list)
  await ctx.watch(); // re-bundle on every save

  const send = (res, type, body) => {
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/" || path === "/index.html") return send(res, "text/html; charset=utf-8", GALLERY_HTML);
    if (path === "/bundle.js") return send(res, "text/javascript; charset=utf-8", bundleText);
    if (path === "/components.json") return send(res, "application/json", componentsJson);
    if (path === "/livereload") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write("\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  server.listen(port, host, () => console.log(`live preview → http://${host}:${port}  (Ctrl-C to stop)`));
}
