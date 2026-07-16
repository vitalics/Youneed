// Minimal CSS completion inside a css`` template: offer property names when the
// cursor sits in a declaration position (inside `{ … }`, after `{`/`;`, before the
// `:`). Values are left to the user (v1). `${…}` holes are skipped as opaque.
import type * as ts from "typescript";
import { skipHole, type TemplateMatch } from "./template.ts";

// A curated set of common CSS properties (enough to be useful without shipping the
// full CSS database). Extend freely.
const CSS_PROPERTIES = [
  "align-items", "align-self", "animation", "appearance", "aspect-ratio", "background", "background-color", "background-image",
  "border", "border-radius", "border-color", "border-width", "border-style", "bottom", "box-shadow", "box-sizing",
  "color", "columns", "content", "cursor", "display", "filter", "flex", "flex-direction", "flex-grow", "flex-shrink",
  "flex-wrap", "font", "font-family", "font-size", "font-weight", "font-variant-numeric", "gap", "grid", "grid-template-columns",
  "grid-template-rows", "height", "inset", "justify-content", "justify-items", "left", "letter-spacing", "line-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "max-height", "max-width", "min-height", "min-width",
  "opacity", "outline", "overflow", "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "place-items",
  "pointer-events", "position", "right", "rotate", "row-gap", "scale", "text-align", "text-decoration", "text-overflow",
  "text-transform", "top", "transform", "transition", "translate", "user-select", "vertical-align", "visibility",
  "white-space", "width", "will-change", "word-break", "z-index",
];

const isNameChar = (c: string) => /[-a-zA-Z]/.test(c);

export interface CssContext {
  type: "property" | "value" | "selector";
  word: string;
  replaceFrom: number;
}

export function cssContextAt(raw: string, cursorRel: number): CssContext {
  let depth = 0;
  let afterColon = false;
  let i = 0;
  while (i < cursorRel) {
    const c = raw[i];
    if (c === "$" && raw[i + 1] === "{") {
      const end = skipHole(raw, i);
      if (cursorRel > i && cursorRel < end) return { type: "value", word: "", replaceFrom: cursorRel }; // inside ${…} → defer
      i = end;
      continue;
    }
    if (c === "{") {
      depth++;
      afterColon = false;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
      afterColon = false;
    } else if (c === ";") {
      afterColon = false;
    } else if (c === ":") {
      afterColon = true;
    }
    i++;
  }
  // word = trailing name chars before the cursor
  let start = cursorRel;
  while (start > 0 && isNameChar(raw[start - 1])) start--;
  const word = raw.slice(start, cursorRel);
  const type = depth === 0 ? "selector" : afterColon ? "value" : "property";
  return { type, word, replaceFrom: start };
}

export function cssCompletions(tsm: typeof ts, match: TemplateMatch): ts.CompletionInfo | undefined {
  const ctx = cssContextAt(match.raw, match.cursorRel);
  if (ctx.type !== "property") return undefined;
  const span: ts.TextSpan = { start: match.base + ctx.replaceFrom, length: match.cursorRel - ctx.replaceFrom };
  return {
    isGlobalCompletion: false,
    isMemberCompletion: false,
    isNewIdentifierLocation: true,
    entries: CSS_PROPERTIES.map((name, i) => ({
      name,
      kind: tsm.ScriptElementKind.memberVariableElement,
      kindModifiers: "",
      sortText: `0${String(i).padStart(4, "0")}`,
      insertText: `${name}: `,
      replacementSpan: span,
      labelDetails: { description: "CSS property" },
    })),
  };
}
