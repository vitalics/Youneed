// A tiny, dependency-free syntax highlighter for the docs code blocks. It
// tokenizes either HTML markup (tags / attributes / values) or JS/TS (keywords /
// strings / comments / numbers) and returns escaped <span class="tok-…"> pieces
// — colored by the .tok-* rules in <docs-view>'s styles (light + dark).

import { html, css, type TemplateResult } from "@youneed/dom";

/** Token colors for highlighted code — GitHub light palette, with a dark
 *  override driven by the `.dark` class on <html> (via `:host-context`).
 *  Adopt it into any component that renders a `<code>` block from `highlight()`. */
export const tokenStyles = css`
  code .tok-comment { color: #6e7781; font-style: italic; }
  code .tok-tag { color: #116329; }
  code .tok-attr { color: #0550ae; }
  code .tok-string { color: #0a3069; }
  code .tok-keyword { color: #cf222e; }
  code .tok-number { color: #0550ae; }
  code .tok-punct { color: hsl(var(--muted-foreground)); }
  :host-context(.dark) code .tok-comment { color: #8b949e; }
  :host-context(.dark) code .tok-tag { color: #7ee787; }
  :host-context(.dark) code .tok-attr { color: #79c0ff; }
  :host-context(.dark) code .tok-string { color: #a5d6ff; }
  :host-context(.dark) code .tok-keyword { color: #ff7b72; }
  :host-context(.dark) code .tok-number { color: #79c0ff; }
`;

interface Token {
  /** Class suffix: "tag" | "attr" | "string" | "keyword" | "comment" |
   *  "number" | "punct"; "" = plain text. */
  type: string;
  value: string;
}

const JS_KEYWORDS = new Set(
  ("import export default from const let var function return if else for while " +
    "class extends new await async type interface enum implements public private " +
    "readonly static get set of in typeof instanceof void null undefined true false this")
    .split(" "),
);

/** HTML / custom-element markup: <tag attr="value">text</tag>. */
function tokenizeHtml(src: string): Token[] {
  const out: Token[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    if (src[i] === "<") {
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i);
        const j = end === -1 ? n : end + 3;
        out.push({ type: "comment", value: src.slice(i, j) });
        i = j;
        continue;
      }
      const lead = src.startsWith("</", i) ? "</" : "<";
      out.push({ type: "punct", value: lead });
      i += lead.length;
      const name = /^[a-zA-Z][\w-]*/.exec(src.slice(i));
      if (name) {
        out.push({ type: "tag", value: name[0] });
        i += name[0].length;
      }
      while (i < n && src[i] !== ">") {
        const c = src[i];
        if (/\s/.test(c)) {
          let j = i;
          while (j < n && /\s/.test(src[j])) j++;
          out.push({ type: "", value: src.slice(i, j) });
          i = j;
        } else if (c === "/") {
          out.push({ type: "punct", value: "/" });
          i++;
        } else if (c === "=") {
          out.push({ type: "punct", value: "=" });
          i++;
        } else if (c === '"' || c === "'") {
          let j = i + 1;
          while (j < n && src[j] !== c) j++;
          j = Math.min(j + 1, n);
          out.push({ type: "string", value: src.slice(i, j) });
          i = j;
        } else {
          const attr = /^[^\s=>/"']+/.exec(src.slice(i));
          if (attr) {
            out.push({ type: "attr", value: attr[0] });
            i += attr[0].length;
          } else {
            out.push({ type: "", value: c });
            i++;
          }
        }
      }
      if (i < n && src[i] === ">") {
        out.push({ type: "punct", value: ">" });
        i++;
      }
      continue;
    }
    let j = src.indexOf("<", i);
    if (j === -1) j = n;
    out.push({ type: "", value: src.slice(i, j) });
    i = j;
  }
  return out;
}

/** JS / TS: comments, strings, numbers, keywords, punctuation. */
function tokenizeJs(src: string): Token[] {
  const out: Token[] = [];
  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\w.]*)|([A-Za-z_$][\w$]*)|([{}()[\].,;:=<>+\-*/%!&|?]+)|(\s+)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ type: "", value: src.slice(last, m.index) });
    if (m[1]) out.push({ type: "comment", value: m[0] });
    else if (m[2]) out.push({ type: "string", value: m[0] });
    else if (m[3]) out.push({ type: "number", value: m[0] });
    else if (m[4]) out.push({ type: JS_KEYWORDS.has(m[0]) ? "keyword" : "", value: m[0] });
    else if (m[5]) out.push({ type: "punct", value: m[0] });
    else out.push({ type: "", value: m[0] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ type: "", value: src.slice(last) });
  return out;
}

/** Tokenize `code` and return colored (escaped) spans for a code block. */
export function highlight(code: string): TemplateResult[] {
  const tokens = /^\s*</.test(code) ? tokenizeHtml(code) : tokenizeJs(code);
  return tokens.map((tk) =>
    tk.type ? html`<span class=${"tok-" + tk.type}>${tk.value}</span>` : html`${tk.value}`,
  );
}
