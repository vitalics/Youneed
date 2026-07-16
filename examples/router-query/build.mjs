// Bundle the query-router demo client into a single IIFE.
import { build } from "esbuild";

await build({
  entryPoints: ["examples/router-query/client.ts"],
  bundle: true,
  outfile: "examples/router-query/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/router-query/app.js");
