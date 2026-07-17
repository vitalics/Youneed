import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { domFramework } from "@youneed/vite-plugin";

// The site is built with the framework it documents: @youneed/dom components,
// TC39 decorators lowered by @youneed/vite-plugin (Vite's oxc/esbuild leave
// them raw → browser SyntaxError without it).
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  // Bundle the framework from its TypeScript source, same as examples/vite.
  resolve: {
    alias: {
      "@youneed/dom-provider-timers": here("../packages/dom-provider-timers/src/index.ts"),
      "@youneed/dom": here("../packages/dom/src/index.ts"),
    },
  },
  plugins: [domFramework()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: here("index.html"),
        docs: here("docs/index.html"),
      },
    },
  },
});
