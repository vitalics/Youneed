// Bundle the client entry into a single self-contained IIFE (works over file://).
import { build } from "esbuild";

await build({
  entryPoints: ["examples/ssg/client.ts"],
  bundle: true,
  outfile: "examples/ssg/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/ssg/app.js");
