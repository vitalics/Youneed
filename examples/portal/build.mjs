// Bundle the portal/classMap demo client into a single IIFE.
import { build } from "esbuild";

await build({
  entryPoints: ["examples/portal/client.ts"],
  bundle: true,
  outfile: "examples/portal/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/portal/app.js");
