// 1) Compile Tailwind (real v4 CLI) → tailwind.gen.css, scoped to this example's
//    files via @source in styles.css. 2) Bundle the client, importing that CSS
//    as text so it can be adopted into the component's shadow root.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

execFileSync(
  "node_modules/.bin/tailwindcss",
  ["-i", "examples/tailwind/styles.css", "-o", "examples/tailwind/tailwind.gen.css", "--minify"],
  { stdio: "inherit" },
);

await build({
  entryPoints: ["examples/tailwind/client.ts"],
  bundle: true,
  outfile: "examples/tailwind/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  loader: { ".css": "text" },
  logLevel: "info",
});

console.log("built examples/tailwind/app.js");
