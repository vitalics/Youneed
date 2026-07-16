// Bundle the slash (history) router demo client into a single IIFE.
import { build } from "esbuild";

await build({
  entryPoints: ["examples/router-slash/client.ts"],
  bundle: true,
  outfile: "examples/router-slash/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/router-slash/app.js");
