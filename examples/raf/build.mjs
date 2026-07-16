// Bundle the rafScheduler demo client into a single IIFE (works over file://).
import { build } from "esbuild";

await build({
  entryPoints: ["examples/raf/client.ts"],
  bundle: true,
  outfile: "examples/raf/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/raf/app.js");
