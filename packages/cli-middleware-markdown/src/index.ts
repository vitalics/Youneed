// @youneed/cli-middleware-markdown — render Markdown to terminal output.
//
//   class Readme extends Command("readme", { middleware: [markdown()] }) {
//     execute() { console.log(this.markdown("# Title\n\nSome **bold** text.")); }
//   }
//
// `this.markdown(md)` returns ANSI-styled text: headings, bold/italic, inline
// `code`, fenced blocks, lists, block-quotes, rules and links. Line-oriented and
// dependency-free — enough for help text, release notes and docs.

import { contribute, type CliMiddleware } from "@youneed/cli";

const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const italic = (s: string): string => `\x1b[3m${s}\x1b[23m`;
const underline = (s: string): string => `\x1b[4m${s}\x1b[24m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;
const inverse = (s: string): string => `\x1b[7m${s}\x1b[27m`;

/** Apply inline styling: `code`, **bold**, *italic*, [text](url). */
function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, c: string) => inverse(` ${c} `))
    .replace(/\*\*([^*]+)\*\*/g, (_, c: string) => bold(c))
    .replace(/(^|[^*])\*([^*]+)\*/g, (_, p: string, c: string) => p + italic(c))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t: string, u: string) => `${underline(cyan(t))} ${dim("(" + u + ")")}`);
}

/** Render a Markdown string to ANSI-styled terminal text. */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    if (raw.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(dim("  " + raw));
      continue;
    }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!;
      out.push(level <= 2 ? bold(underline(text)) : bold(text));
      continue;
    }
    if (/^\s*([-*+])\s+/.test(raw)) {
      out.push(raw.replace(/^(\s*)[-*+]\s+/, (_, s: string) => `${s}${cyan("•")} `).replace(/(.*)/, (l) => inline(l)));
      continue;
    }
    if (/^\s*>\s?/.test(raw)) {
      out.push(dim("┃ ") + inline(raw.replace(/^\s*>\s?/, "")));
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) {
      out.push(dim("─".repeat(40)));
      continue;
    }
    out.push(inline(raw));
  }
  return out.join("\n");
}

/** `this.markdown` — render Markdown to terminal text. */
export type Markdown = (md: string) => string;

/** Markdown middleware. Adds `this.markdown(md)`. */
export function markdown(): CliMiddleware<{ readonly markdown: Markdown }> {
  return {
    name: "markdown",
    install(ctx) {
      contribute(ctx.command, "markdown", renderMarkdown);
    },
  };
}
