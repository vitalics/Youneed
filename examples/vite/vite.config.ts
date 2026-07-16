import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { domFramework } from "@youneed/vite-plugin";

// Resolve `@youneed/dom` to its TypeScript source so the example bundles the
// framework directly (the `domFramework` plugin lowers its TC39 decorators).
const domSrc = fileURLToPath(new URL("../../packages/dom/src/index.ts", import.meta.url));

// `domFramework()` transpiles our framework's TC39 decorators (Vite 8's oxc and
// esbuild-at-esnext leave them raw → browser SyntaxError). It must come BEFORE
// the React/Vue plugins so it pre-processes `.ts` sources first.
export default defineConfig({
  root: __dirname,
  resolve: { alias: { "@youneed/dom": domSrc } },
  plugins: [
    domFramework(),
    react(),
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.includes("-") } } }),
  ],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
