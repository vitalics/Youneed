// @youneed/ssr-plugin-llms — an llms.txt SSR module.
//
// Implements the llms.txt convention (https://llmstxt.org): a markdown file at
// /llms.txt giving LLM crawlers a curated, link-first map of the site.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { llms } from "@youneed/ssr-plugin-llms";
//
//   app.plugin(ssr({
//     origin: "https://example.com",
//     pages: [Home, Docs, Pricing],
//     modules: [
//       llms({
//         title: "Example",
//         summary: "A widget store with a public API.",
//         notes: ["All prices in USD."],
//         sections: [
//           { title: "Docs", links: [{ title: "API", url: "/docs/api", notes: "REST reference" }] },
//         ],
//         includePages: true, // append a "Pages" section from mounted routes
//       }),
//     ],
//   }));

import { Response } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

/** A single curated link within a section. */
export interface LlmsLink {
  title: string;
  /** Path (resolved against `origin`) or an absolute URL. */
  url: string;
  /** Trailing note after the link (`[title](url): notes`). */
  notes?: string;
}

/** An `## H2` section of grouped links. */
export interface LlmsSection {
  title: string;
  links: LlmsLink[];
}

export interface LlmsOptions {
  /** Served path. Default `"/llms.txt"`. */
  path?: string;
  /** The `# H1` site name (required by the spec). */
  title: string;
  /** The `> blockquote` one-line summary. */
  summary?: string;
  /** Free-form paragraphs after the summary. */
  notes?: string[];
  /** Curated link sections. */
  sections?: LlmsSection[];
  /** Append a section listing the mounted static page routes. Default `false`.
   *  Pass a string to name the section (default `"Pages"`). */
  includePages?: boolean | string;
}

const link = (l: LlmsLink, ctx: SsrModuleContext): string =>
  `- [${l.title}](${ctx.absolute(l.url)})${l.notes ? `: ${l.notes}` : ""}`;

/** Render the llms.txt markdown body. */
export function buildLlms(options: LlmsOptions, ctx: SsrModuleContext): string {
  const out: string[] = [`# ${options.title}`];
  if (options.summary) out.push(`\n> ${options.summary}`);
  for (const note of options.notes ?? []) out.push(`\n${note}`);

  const sections = [...(options.sections ?? [])];
  if (options.includePages) {
    const title = typeof options.includePages === "string" ? options.includePages : "Pages";
    const links = ctx.routes
      .filter((r) => !r.dynamic)
      .map((r) => ({ title: r.title ?? r.url, url: r.url }));
    if (links.length) sections.push({ title, links });
  }

  for (const section of sections) {
    out.push(`\n## ${section.title}\n`);
    out.push(section.links.map((l) => link(l, ctx)).join("\n"));
  }
  return out.join("\n") + "\n";
}

/** An llms.txt {@link SsrModule}. */
export function llms(options: LlmsOptions): SsrModule {
  const path = options.path ?? "/llms.txt";
  return {
    name: "llms",
    setup(ctx) {
      const body = buildLlms(options, ctx);
      ctx.app.get(path, () =>
        Response.text(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
      );
    },
    inspect() {
      return { kind: "llms", path };
    },
  };
}
