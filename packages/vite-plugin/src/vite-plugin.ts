// vite-plugin.ts — make the dom.ts framework work under Vite.
//
//   import { defineConfig } from "vite";
//   import { domFramework } from "../../src/vite-plugin.ts";
//   export default defineConfig({ plugins: [domFramework(), /* react(), vue() … */] });
//
// WHY THIS EXISTS
// The framework's components use TC39 *standard* decorators (`@Component.define()`,
// `@Component.prop()`, …). No browser runs those natively yet, so they must be
// transpiled. But Vite 8 transpiles with oxc, and neither oxc nor esbuild at its
// default `esnext` target lowers standard decorators — they leave `@deco class …`
// raw, which is a SyntaxError in the browser. The first such module fails to
// load and takes the whole entry graph down with it.
//
// esbuild DOES lower them when told the target lacks decorator support. So this
// plugin runs BEFORE Vite's transform (`enforce: "pre"`) and pre-transpiles the
// project's `.ts` sources with esbuild + `supported: { decorators: false }`,
// handing Vite decorator-free JS. Works in dev and build.

import type { Plugin } from "vite";
import { transform } from "esbuild";

export interface DomFrameworkOptions {
  /**
   * Decide which modules to pre-transpile. Default: project `.ts`/`.mts`/`.cts`
   * (not `.tsx` — JSX is left to its own plugin — and not `node_modules`).
   */
  include?: (path: string) => boolean;
  /** esbuild target for the decorator lowering (default `"es2022"`). */
  target?: string;
}

const DEFAULT_INCLUDE = (path: string): boolean =>
  /\.(m|c)?ts$/.test(path) && !path.includes("node_modules");

// A decorator usage is `@Ident(` or `@a.b.c(` — our decorators are always called
// (`@Component.define()`). Matching is just a cheap gate; a false positive only
// means we transpile a file that didn't need it, which is harmless (esbuild does
// a plain TS→JS pass and leaves non-decorator code as-is).
const HAS_DECORATOR = /@[A-Za-z_$][\w.]*\s*\(/;

/**
 * Vite plugin that lets dom.ts components (TC39 decorators) run under Vite 8.
 * Add it BEFORE `@vitejs/plugin-react` / `@vitejs/plugin-vue` in the plugins array.
 */
export function domFramework(options: DomFrameworkOptions = {}): Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const target = options.target ?? "es2022";

  return {
    name: "vite-plugin-dom-framework",
    enforce: "pre",
    async transform(code, id) {
      const path = id.split("?")[0];
      if (!include(path) || !HAS_DECORATOR.test(code)) return null;
      const out = await transform(code, {
        loader: "ts",
        target,
        supported: { decorators: false }, // force standard-decorator lowering
        sourcemap: true,
        sourcefile: path,
      });
      return { code: out.code, map: out.map };
    },
  };
}

export default domFramework;
