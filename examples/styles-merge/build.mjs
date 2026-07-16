// Bundle the style-merge demo. The text loader makes both the static options
// import and the lazy () => import() resolve to CSS strings.
import { build } from "esbuild";
await build({
  entryPoints: ["examples/styles-merge/client.ts"],
  bundle: true,
  outfile: "examples/styles-merge/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  loader: { ".css": "text" },
  logLevel: "info",
});
console.log("built examples/styles-merge/app.js");
