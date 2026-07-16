// @youneed/ssr-plugin-speculation — Speculation Rules as page middleware.
//
// The Speculation Rules API (https://developer.mozilla.org/en-US/docs/Web/API/
// Speculation_Rules_API) lets a page tell the browser which URLs to prefetch or
// prerender. A page DECLARES its rules through @youneed/ssr's `speculation`
// option (or a `speculation()` override); this package is the opt-in middleware
// that turns that declaration into the `<script type="speculationrules">`
// injected into the document head.
//
// Two ways to enable it:
//
//  1. As an SSR module, via @youneed/server-plugin-ssr:
//
//       import { ssr } from "@youneed/server-plugin-ssr";
//       import { speculation } from "@youneed/ssr-plugin-speculation";
//       app.plugin(ssr({ pages: [Home, About], modules: [speculation()] }));
//
//  2. Directly, when mounting with @youneed/ssr's `mountPages`:
//
//       import { enableSpeculation } from "@youneed/ssr-plugin-speculation";
//       enableSpeculation();
//       mountPages(Application(), Home, About);

import { registerPageMiddleware } from "@youneed/ssr";
import type { PageMiddleware, PageRenderContext, SpeculationRules } from "@youneed/ssr";
import type { SsrModule } from "@youneed/server-plugin-ssr";

export type { SpeculationRules } from "@youneed/ssr";

/** Serialize speculation rules into the inline `<script>` the browser reads.
 *  `<` is escaped so a URL containing "</script>" can't break out of the tag. */
export function speculationScript(rules: SpeculationRules): string {
  const json = JSON.stringify(rules).replace(/</g, "\\u003c");
  return `<script type="speculationrules">${json}</script>`;
}

/** Page middleware: emit the page's declared speculation rules (if any). */
export const speculationMiddleware: PageMiddleware = (c: PageRenderContext) => {
  const rules = c.page.speculation(c.ctx);
  return rules ? speculationScript(rules) : undefined;
};

// Idempotent: the middleware is a singleton, so registering it more than once
// (two apps, repeated setup) would double-inject. Guard so it lands once.
let installed = false;
let dispose: (() => void) | undefined;

/** Enable Speculation Rules injection for all rendered pages. Returns a disposer.
 *  Idempotent — repeated calls return the same teardown. */
export function enableSpeculation(): () => void {
  if (!installed) {
    installed = true;
    const off = registerPageMiddleware(speculationMiddleware);
    dispose = () => {
      installed = false;
      dispose = undefined;
      off();
    };
  }
  return dispose ?? (() => {});
}

/** An {@link SsrModule} that enables Speculation Rules injection site-wide. */
export function speculation(): SsrModule {
  return {
    name: "speculation",
    setup() {
      enableSpeculation();
    },
    inspect() {
      return { kind: "speculation" };
    },
  };
}
