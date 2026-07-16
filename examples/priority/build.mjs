// Bundle the render-priority demo client into a single IIFE (works over file://).
import { build } from "esbuild";

await build({
  entryPoints: ["examples/priority/client.ts"],
  bundle: true,
  outfile: "examples/priority/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/priority/app.js");
