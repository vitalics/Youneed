// Preview config for the `@youneed/ts-plugin` `@preview` feature — authored like
// an esbuild / vite plugin config. Run it to render the components to PNGs:
//
//   node generate-previews.mjs           # one-shot PNGs (the hover artifacts)
//   node generate-previews.mjs --watch   # re-render PNGs whenever the entry changes
//   node generate-previews.mjs --serve   # ← live dev-server: fast, real render loop
//
// For DEVELOPING components, prefer `--serve`: it opens a browser gallery that
// re-bundles incrementally and reloads on every save (tens of ms), instead of the
// slow Chromium-screenshot cycle. The PNG modes exist to (re)generate the committed
// `preview/<tag>.png` artifacts the ts-plugin shows on hover (auto-discovered, mtime
// cache-busted). If Chromium isn't installed (PNG modes only):
// `npx playwright install chromium` (or point at a build via `PW_CHROMIUM_PATH=…`).
import { watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineComponentPreview, runComponentPreview, serveComponentPreview } from "@youneed/ts-plugin/preview";

const here = dirname(fileURLToPath(import.meta.url));

const config = defineComponentPreview({
  file: resolve(here, "demo.ts"),
  outDir: resolve(here, "preview"),

  /**
   * Per-component render control. `c` carries the component's metadata —
   * `c.tag`, `c.className`, `c.doc` (class JSDoc), `c.see`, and `c.props`
   * (each `{ name, type, doc }`). Return:
   *   • `{ props }` — properties to assign on the element
   *   • `{ html }`  — raw markup for the wrapper (full control)
   *   • `{ skip: true }` — don't render this component
   *   • `{ width, wait }` — wrapper min-width / render settle delay (ms)
   * Return nothing to fall back to auto-sampled props (by prop type).
   */
  generate(c) {
    if (c.tag === "todo-item") return { props: { text: "Buy milk", done: false } };
    if (c.tag === "todo-app") return { html: "<todo-app></todo-app>", width: 240 };
    if (c.tag === "status-pill") return { props: { label: "Ready" }, width: 120 };
    return {}; // others: auto-sample props from their types
  },
});

export default config;

// Run when invoked directly (`node generate-previews.mjs`); a no-op on import.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // ── live dev-server: the fast render loop (no Chromium, no PNGs) ──
  if (process.argv.includes("--serve")) {
    const pi = process.argv.indexOf("--port");
    const portArg = pi >= 0 ? Number(process.argv[pi + 1]) : undefined;
    await serveComponentPreview(config, { port: portArg || undefined });
  } else {
    // ── PNG modes: (re)generate the committed hover artifacts ──
    const run = () => runComponentPreview(config).catch((e) => console.error(e?.message ?? e));
    await run();

    if (process.argv.includes("--watch")) {
      const files = (Array.isArray(config.file) ? config.file : [config.file]).map((f) => resolve(f));
      const names = new Set(files.map(basename));
      let timer;
      for (const dir of new Set(files.map(dirname))) {
        watch(dir, (_e, f) => {
          if (!f || !names.has(f)) return; // only the entry file(s); ignore preview/ writes
          clearTimeout(timer);
          timer = setTimeout(run, 150); // debounce editors' atomic saves
        });
      }
      console.log("watching for changes… (Ctrl-C to stop)");
    }
  }
}
