// 1) Compile Tailwind → tailwind.gen.css (scanning the shad sources + this app).
// 2) Bundle the client hydration entry → client.js (CSS imported as text and
//    adopted into shadow roots). The SSR server (bin-shad.ts) compiles Tailwind
//    too and serves client.js.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

execFileSync(
  "node_modules/.bin/tailwindcss",
  ["-i", "examples/shad/styles.css", "-o", "examples/shad/tailwind.gen.css", "--minify"],
  { stdio: "inherit" },
);

await build({
  entryPoints: ["examples/shad/client.ts"],
  bundle: true,
  outfile: "examples/shad/client.js",
  format: "esm",
  target: "es2022", // lowers our TC39 decorators (esbuild leaves them raw at esnext)
  charset: "utf8",
  loader: { ".css": "text" },
  logLevel: "info",
});

console.log("built examples/shad/client.js");
