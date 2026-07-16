import { build } from "esbuild";
await build({
  entryPoints: ["examples/providers/client.ts"],
  bundle: true,
  outfile: "examples/providers/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});
console.log("built examples/providers/app.js");
