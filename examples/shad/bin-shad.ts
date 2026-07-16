// SSR server for the shad docs. Run: pnpm examples:serve:shad  ->  :3020
//
// happy-dom is registered first (components extend HTMLElement at import).
// Tailwind is registered SERVER-side too, so each component's Declarative Shadow
// DOM ships already-styled (no flash before hydration). Clean URLs are served
// dynamically via the :slug route.

import { registerDOM } from "@youneed/dom/register";
import { readFileSync } from "node:fs";

registerDOM();

Promise.all([
  import("@youneed/ssr"),
  import("@youneed/server"),
  import("@youneed/dom-ui-shad"),
  import("./pages.ts"),
]).then(([ssr, server, shad, pages]) => {
  const { mountPages } = ssr;
  const { Application, Response, File } = server;
  const tailwindCss = readFileSync("examples/shad/tailwind.gen.css", "utf8");

  // Pick the SSR style strategy via env, e.g. SHAD_CSS=fouc pnpm examples:serve:shad
  //   critical (default) · fouc (declarative-adopted) · lazy (<link>) · inline
  const strategy = (process.env.SHAD_CSS ?? "critical") as
    "critical" | "fouc" | "lazy" | "inline";
  const cssHref = "/tailwind.gen.css";
  shad.registerTailwind(tailwindCss, {
    strategy,
    ...(strategy === "lazy" ? { href: cssHref } : {}),
  });
  // Tailwind v4's `@property` registrations must live at the document level —
  // inside a shadow root Chromium ignores them and every `border` collapses.
  // Served here and <link>ed from the page <head> so SSR markup is correct even
  // before hydration (registerTailwind also re-registers them on the client).
  const tailwindProps = shad.tailwindProperties(tailwindCss);
  console.log(`  CSS strategy: ${strategy}`);

  const app = mountPages(Application(), pages.ComponentsPage)
    .get("/", () => Response({ status: 302, headers: { location: "/components/button" } }))
    .get("/client.js", File("examples/shad/client.js"))
    .get("/theme.css", File("packages/dom-ui-shad/src/theme.css"))
    .get("/tw-properties.css", () =>
      Response({ headers: { "Content-Type": "text/css" }, body: tailwindProps }));

  // "lazy" fetches the sheet over the network, so serve it.
  if (strategy === "lazy") app.get(cssHref, File("examples/shad/tailwind.gen.css"));

  app.listen(3020, (ctx) => {
    console.log(`shad docs (SSR) on http://localhost:${ctx.port}`);
    console.log("  GET /components/:slug  ·  /  →  /components/button");
  });
});
