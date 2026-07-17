// The landing page as a @youneed/ssr Page. The static sections live in
// fragments/landing.html; the interactive package catalog is pre-rendered to
// Declarative Shadow DOM on the server, so the full table is in the HTML
// before (and without) any JavaScript.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Page, renderToString, Meta, Link } from "@youneed/ssr";
import { PackageExplorer } from "../components/package-explorer.ts";
import { baseHead } from "./head.ts";
import { DocsPage } from "./docs.ts";

const fragment = readFileSync(
  fileURLToPath(new URL("../fragments/landing.html", import.meta.url)),
  "utf8",
);

export class MainPage extends Page("/", {
  title: "youneed — TypeScript on native platform primitives",
  head: [
    Meta({
      name: "description",
      content:
        "youneed is a TypeScript-first toolkit for building web apps on native platform primitives — Custom Elements, Shadow DOM, the HTTP server, the Speculation Rules API. No virtual DOM, minimal runtime.",
    }),
    ...baseHead(),
    Link({ rel: "stylesheet", href: "/assets/landing.css" }),
  ],
  clientScript: () => import("../main.ts"),
  speculation: {
    prerender: [{ source: "list", urls: [DocsPage.url], eagerness: "moderate" }],
  },
}) {
  render() {
    return fragment.replace(
      /<yn-package-explorer>[\s\S]*?<\/yn-package-explorer>/,
      () => renderToString(PackageExplorer),
    );
  }
}
