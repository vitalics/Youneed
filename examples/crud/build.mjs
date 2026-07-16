import { build } from "esbuild";
await build({
  entryPoints: ["examples/crud/client.ts"],
  bundle: true,
  outfile: "examples/crud/client.js",
  format: "esm",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});
console.log("built examples/crud/client.js");
