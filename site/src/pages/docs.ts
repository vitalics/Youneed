// The docs page as a @youneed/ssr Page. Static sections live in
// fragments/docs.html; on the server we pre-render:
//   • both <yn-docs-nav> sidebars (light DOM — the nav is readable without JS),
//   • the <yn-package-index> full anchor index in #naming (light DOM, static —
//     the sidebar's per-package links target its #pkg-<dir> blocks),
//   • the data-hl code blocks (the highlighter runs at render time, so the
//     page is fully styled with JavaScript disabled — data-hl is dropped and
//     the client highlighter has nothing left to do).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Page, renderToString, Meta, Link } from "@youneed/ssr";
import { DocsNav } from "../components/docs-nav.ts";
import { PackageIndex } from "../components/package-index.ts";
import { highlight } from "../highlight.ts";
import { baseHead } from "./head.ts";

const fragment = readFileSync(
  fileURLToPath(new URL("../fragments/docs.html", import.meta.url)),
  "utf8",
);

// The fragment stores code samples entity-escaped; decode before tokenizing
// (the highlighter re-escapes). `&amp;` must decode last.
const decodeEntities = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export class DocsPage extends Page("/docs", {
  title: "Docs — youneed",
  head: [
    Meta({
      name: "description",
      content:
        "youneed docs: installation, quick start, and per-package sections grouped by ecosystem — dom, server, ssr, cli — plus the adapters, providers, middleware and plugins that snap into each.",
    }),
    ...baseHead(),
    Link({ rel: "stylesheet", href: "/assets/docs.css" }),
  ],
  clientScript: () => import("../docs.ts"),
  speculation: {
    prerender: [{ source: "list", urls: ["/"], eagerness: "moderate" }],
  },
}) {
  render() {
    return fragment
      .replace(/<yn-docs-nav><\/yn-docs-nav>/g, () => renderToString(DocsNav))
      .replace(/<yn-package-index><\/yn-package-index>/, () => renderToString(PackageIndex))
      .replace(
        /(<pre class="code" tabindex="0") data-hl(?:="")?(><code>)([\s\S]*?)(<\/code><\/pre>)/g,
        (_m, open, mid, code, close) => open + mid + highlight(decodeEntities(code)) + close,
      );
  }
}
