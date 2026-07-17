// Live SSR server for the site — the same Pages the SSG build renders, served
// by @youneed/server + @youneed/ssr. Run `node site/scripts/build-client.mjs`
// first (client bundles), then `tsx site/src/index.ts`.
//
// registerDOM() must run before the pages import @youneed/dom components
// (they extend HTMLElement at import time) — hence the dynamic imports.
import { registerDOM } from "@youneed/dom/register";
import { fileURLToPath } from "node:url";

registerDOM();

const { Application } = await import("@youneed/server");
const { staticFiles } = await import("@youneed/server-middleware-static");
const { mountPages } = await import("@youneed/ssr");
const { enableSpeculation } = await import("@youneed/ssr-plugin-speculation");
const { MainPage } = await import("./pages/main.ts");
const { DocsPage } = await import("./pages/docs.ts");

enableSpeculation(); // PageOptions.speculation → <script type="speculationrules">

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

mountPages(
  Application()
    .use(staticFiles(here("../public"))) // tokens.css, /assets/*.css, design variants
    .use(staticFiles(here("../dist-client"))), // /main.js, /docs.js (build-client.mjs)
  MainPage,
  DocsPage,
).listen(3000, (ctx) => {
  console.log(`site SSR listening on http://localhost:${ctx.port}`);
});
