// Pure helpers for the `unusedCss` audit: find the class selectors a css`` template
// defines, and collect every class token referenced anywhere in a source file. A
// class is "unused" if it's defined but never referenced. Bias to UNDER-reporting:
// we'd rather miss a dead class than flag a live one, so "referenced" is generous
// (any whitespace-separated token of any string literal in the file counts — that
// covers `class="x"`, `class=${cond ? "x" : ""}`, and `classList.add("x")`).
import type * as ts from "typescript";
import { skipHole } from "./template.ts";

const isSelectorNameStart = (c: string | undefined): boolean => !!c && /[A-Za-z_-]/.test(c);
const isSelectorNameChar = (c: string | undefined): boolean => !!c && /[\w-]/.test(c);

/** Class selectors (`.name`) declared in a css`` template, with their offset (of
 *  the name, after the dot) within `raw`. Text scan: `${…}` holes are skipped, and
 *  a `.` inside a declaration VALUE (after `:`, before `;`/`}`) is ignored so
 *  `transition: .2s` isn't mistaken for a class. Best-effort, not a full parser. */
export function cssClassSelectors(raw: string): { name: string; start: number }[] {
  const out: { name: string; start: number }[] = [];
  let depth = 0;
  let inValue = false;
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "$" && raw[i + 1] === "{") {
      i = skipHole(raw, i);
      continue;
    }
    if (c === "/" && raw[i + 1] === "*") {
      const end = raw.indexOf("*/", i + 2);
      i = end < 0 ? raw.length : end + 2;
      continue;
    }
    if (c === "{") {
      depth++;
      inValue = false;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
      inValue = false;
    } else if (c === ";") {
      inValue = false;
    } else if (c === ":") {
      if (depth > 0) inValue = true; // a declaration value begins (pseudo at depth 0 is a selector)
    } else if (c === "." && !inValue && isSelectorNameStart(raw[i + 1])) {
      let j = i + 1;
      let name = "";
      while (j < raw.length && isSelectorNameChar(raw[j])) name += raw[j++];
      out.push({ name, start: i + 1 });
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

/** Identifier-ish tokens referenced anywhere in a source file's string literals and
 *  template strings — the "referenced class names" set for unused-CSS. Tokens are
 *  split on any non-`[\w-]` char so a class embedded in markup (`class="pill"` inside
 *  an html`` template, which is just text) is still found. `skipRanges` excludes the
 *  css`` templates being audited — otherwise a class's own definition would count as
 *  a use and nothing would ever be flagged. */
export function stringLiteralTokens(
  tsm: typeof ts,
  sourceFile: ts.SourceFile,
  skipRanges: { start: number; end: number }[] = [],
): Set<string> {
  const tokens = new Set<string>();
  const inSkipped = (pos: number): boolean => skipRanges.some((r) => pos >= r.start && pos < r.end);
  const add = (text: string): void => {
    for (const t of text.split(/[^\w-]+/)) if (t) tokens.add(t);
  };
  const visit = (node: ts.Node): void => {
    const start = node.getStart(sourceFile);
    if (!inSkipped(start)) {
      if (tsm.isStringLiteralLike(node)) {
        add(node.text);
      } else if (tsm.isTemplateExpression(node)) {
        add(node.head.text);
        for (const span of node.templateSpans) add(span.literal.text);
      }
    }
    tsm.forEachChild(node, visit);
  };
  visit(sourceFile);
  return tokens;
}
