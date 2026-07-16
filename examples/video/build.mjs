// Bundle the video example's client entry into /client.js.
import { build } from "esbuild";

await build({
  entryPoints: ["examples/video/client.ts"],
  bundle: true,
  outfile: "examples/video/client.js",
  format: "esm",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/video/client.js");
