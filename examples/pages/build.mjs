// Bundle the Pages client entry into a single ES module served at /client.js.
import { build } from "esbuild";

await build({
  entryPoints: ["examples/pages/client.ts"],
  bundle: true,
  outfile: "examples/pages/client.js",
  format: "esm",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/pages/client.js");
