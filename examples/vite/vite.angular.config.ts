import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import angular from "@analogjs/vite-plugin-angular";
import { domFramework } from "@youneed/vite-plugin";

// Resolve `@youneed/dom` to its TypeScript source (the stepper bundles the
// framework directly; `domFramework` lowers its TC39 decorators).
const domSrc = fileURLToPath(new URL("../../packages/dom/src/index.ts", import.meta.url));

// Angular needs its OWN compilation: its components use LEGACY decorators
// (`experimentalDecorators` + metadata) and an HTML template compiler, neither of
// which can share esbuild's TC39 pass with our `@Component.prop`. So:
//   • `angular()` (Analog) compiles the Angular island (legacy decorators + template);
//   • `domFramework()` lowers our TC39 decorators for `<dom-stepper>` / @youneed/dom.
// `include` scopes Analog to the Angular file only, so the stepper still flows
// through `domFramework`. The two never meet in one pass — that's the whole trick.
export default defineConfig({
  root: __dirname,
  resolve: { alias: { "@youneed/dom": domSrc } },
  plugins: [
    angular({ include: ["**/AngularIsland.ts"] }),
    domFramework(),
  ],
  build: {
    outDir: "dist-angular",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: fileURLToPath(new URL("./angular.html", import.meta.url)) },
  },
});
