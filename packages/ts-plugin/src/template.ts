// Locate the `html`…`` / `css`…`` tagged template containing a file position, and
// expose the raw template source + the cursor offset within it. We work on the raw
// node text (backticks + `${…}` holes included) so all offsets stay file-relative —
// no virtual-document remapping. The html/css scanners treat `${…}` as opaque holes.
import type * as ts from "typescript";

export interface TemplateMatch {
  kind: "html" | "css";
  /** Raw text of the template node, e.g. "`<a href=${x}>`" (leading backtick at 0). */
  raw: string;
  /** File offset of raw[0] (the opening backtick). */
  base: number;
  /** Cursor offset relative to `base` (i.e. index into `raw`). */
  cursorRel: number;
}

/** Tag identifier name of a tagged template (`html`, `css`, or a dotted `.html`). */
function tagName(tsm: typeof ts, tag: ts.Expression): string | undefined {
  if (tsm.isIdentifier(tag)) return tag.text;
  if (tsm.isPropertyAccessExpression(tag)) return tag.name.text;
  return undefined;
}

export function findTemplate(tsm: typeof ts, sourceFile: ts.SourceFile, position: number): TemplateMatch | undefined {
  let found: TemplateMatch | undefined;
  const visit = (node: ts.Node) => {
    if (position < node.getFullStart() || position > node.getEnd()) return; // not on this branch
    if (tsm.isTaggedTemplateExpression(node)) {
      const name = tagName(tsm, node.tag);
      if (name === "html" || name === "css") {
        const tpl = node.template;
        if (position >= tpl.getStart(sourceFile) && position <= tpl.getEnd()) {
          const base = tpl.getStart(sourceFile);
          found = { kind: name, raw: tpl.getText(sourceFile), base, cursorRel: position - base };
          // keep descending — a nested html`` inside a ${…} hole wins (innermost).
        }
      }
    }
    tsm.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** A located template without a cursor — for whole-file passes (diagnostics). */
export interface TemplateText {
  kind: "html" | "css";
  raw: string;
  base: number;
}

/** Every `html`/`css` tagged template in a file (for diagnostics over the file). */
export function findAllTemplates(tsm: typeof ts, sourceFile: ts.SourceFile): TemplateText[] {
  const out: TemplateText[] = [];
  const visit = (node: ts.Node) => {
    if (tsm.isTaggedTemplateExpression(node)) {
      const name = tagName(tsm, node.tag);
      if (name === "html" || name === "css") {
        const tpl = node.template;
        out.push({ kind: name, raw: tpl.getText(sourceFile), base: tpl.getStart(sourceFile) });
      }
    }
    tsm.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

/** Skip a balanced `${ … }` hole starting at raw[i] (i points at '$'). Returns the
 *  index just past the closing '}', or raw.length if unterminated. */
export function skipHole(raw: string, i: number): number {
  // raw[i] === '$' && raw[i+1] === '{'
  let depth = 0;
  for (let j = i + 1; j < raw.length; j++) {
    const c = raw[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return raw.length;
}
