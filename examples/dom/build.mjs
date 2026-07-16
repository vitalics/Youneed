// Bundle the example (bin-dom.ts) + library (dom.ts) into one self-contained
// file. IIFE format => no import/export, so it loads via a classic <script>
// and works even over file:// (ES modules would be blocked by CORS there).

import { build } from "esbuild";

await build({
  entryPoints: ["examples/dom/bin-dom.ts"],
  bundle: true,
  outfile: "examples/dom/bin-dom.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/dom/bin-dom.js");
