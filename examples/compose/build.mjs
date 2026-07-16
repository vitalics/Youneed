import { build } from "esbuild";
await build({ entryPoints: ["examples/compose/client.ts"], bundle: true,
  outfile: "examples/compose/app.js", format: "iife", target: "es2022", charset: "utf8", logLevel: "info" });
console.log("built examples/compose/app.js");
