// Bundle the async-cascade demo client into a single IIFE (works over file://).
import { build } from "esbuild";

await build({
  entryPoints: ["examples/cascade/client.ts"],
  bundle: true,
  outfile: "examples/cascade/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/cascade/app.js");
