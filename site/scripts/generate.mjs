// SSG: render the site's Pages to static HTML in site/dist (Vercel deploys the
// dist directory). Run with tsx (the pages are TypeScript):
//
//   pnpm site:build   →  gen-packages + build-client + this script
//
// The Speculation Rules middleware is enabled so PageOptions.speculation lands
// in the documents; renderPageToString fakes the request context (static pages
// read nothing from it).
import { registerDOM } from "@youneed/dom/register";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

registerDOM();

const { renderPageToString, routeTable } = await import("@youneed/ssr");
const { enableSpeculation } = await import("@youneed/ssr-plugin-speculation");
const { MainPage } = await import("../src/pages/main.ts");
const { DocsPage } = await import("../src/pages/docs.ts");

enableSpeculation();

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here("../dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "docs"), { recursive: true });

const routes = routeTable([MainPage, DocsPage]);
writeFileSync(join(dist, "index.html"), await renderPageToString(MainPage, {}, routes));
writeFileSync(join(dist, "docs", "index.html"), await renderPageToString(DocsPage, {}, routes));

// Static passthrough + client bundles.
cpSync(here("../public"), dist, { recursive: true });
cpSync(here("../dist-client"), dist, { recursive: true });

console.log("SSG → site/dist (index.html, docs/index.html, assets)");
process.exit(0);
