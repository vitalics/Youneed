// Build the bundled CLI devtools UI served by `devtools()` → dist/web/client.js.
// 1) Tailwind → web.gen.css (scanning shad + this package's ext.ts).
// 2) esbuild bundles src/web.ts (CSS imported as text) into dist/web/client.js.
// Run from the package dir (`pnpm --filter @youneed/cli-plugin-devtools build:web`),
// so node_modules/.bin is on PATH. Mirrors @youneed/server-plugin-devtools.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

execFileSync("tailwindcss", ["-i", "web-styles.css", "-o", "web.gen.css", "--minify"], { stdio: "inherit" });

mkdirSync("dist/web", { recursive: true });
await build({
  entryPoints: ["src/web.ts"],
  bundle: true,
  outfile: "dist/web/client.js",
  format: "esm",
  target: "es2022",
  charset: "utf8",
  loader: { ".css": "text" },
  logLevel: "info",
});
console.log("built dist/web/client.js");
