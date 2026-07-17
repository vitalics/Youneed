// Bundle the client entries with esbuild (target es2022 lowers the TC39
// decorators). Output: site/dist-client/{main,docs}.js — the URLs the Pages'
// `clientScript: () => import("../main.ts")` thunks resolve to.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

await build({
  entryPoints: [here("../src/main.ts"), here("../src/docs.ts")],
  bundle: true,
  outdir: here("../dist-client"),
  format: "esm",
  target: "es2022",
  minify: true,
  charset: "utf8",
  logLevel: "info",
});
