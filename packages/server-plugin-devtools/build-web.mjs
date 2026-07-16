// Build the bundled devtools UI served by `serveDevtools` → dist/web/client.js.
// 1) Tailwind → web.gen.css (scanning shad + the server-devtools UI).
// 2) esbuild bundles src/web.ts (CSS imported as text) into dist/web/client.js.
// Run from the package dir (`pnpm --filter @youneed/server-plugin-devtools build:web`),
// so node_modules/.bin is on PATH.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

execFileSync("tailwindcss", ["-i", "web-styles.css", "-o", "web.gen.css", "--minify"], { stdio: "inherit" });

const src = (p) => fileURLToPath(new URL(`src/${p}`, import.meta.url));

mkdirSync("dist/web", { recursive: true });
await build({
  entryPoints: ["src/web.ts"],
  bundle: true,
  outfile: "dist/web/client.js",
  format: "esm",
  target: "es2022",
  charset: "utf8",
  jsx: "automatic",
  loader: { ".css": "text" },
  // The bundled plugin /devtools modules import the renderer registry via the
  // package specifier (→ dist/registry.js), while ext.ts imports it relatively
  // (→ src/registry.ts). Alias both to the SAME source file so there is a single
  // REGISTRY Map — otherwise plugins register into one map and the Infra panel
  // reads an empty other map (panels never appear).
  alias: { "@youneed/server-plugin-devtools/registry": src("registry.ts") },
  logLevel: "info",
});
console.log("built dist/web/client.js");
