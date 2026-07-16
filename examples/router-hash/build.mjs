// Bundle the SPA-router demo client into a single IIFE (works over file://).
import { build } from "esbuild";

await build({
  entryPoints: ["examples/router-hash/client.ts"],
  bundle: true,
  outfile: "examples/router-hash/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/router-hash/app.js");
