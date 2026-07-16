// Builds a map: custom-element tag → { props, events } by statically scanning the
// program's source for @youneed/dom components. A component is a class whose
// `extends` clause calls `Component("tag-name", …)`; its public surface is:
//   • props  — fields decorated `@Component.prop()`  (the `.prop=` bindings);
//   • events — `@Component.event("name")` / `@Component.event() field`, plus any
//              `this.emit("name", …)` found in method bodies (the `@event=` ones).
// Inheritance is followed: a component extending another component (directly, or
// via `Component("tag", BaseComponent)`) inherits its props/events.
//
// Pure & AST-only (no type-checker needed) → unit-testable with bare `typescript`.
import type * as ts from "typescript";

export interface PropInfo {
  name: string;
  /** Best-effort type text for the completion detail (e.g. "number"). */
  type?: string;
  /** Leading JSDoc description of the `@Component.prop()` declaration, if any. */
  doc?: string;
  /** Where the field is declared — for go-to-definition (may be a base class file). */
  defFile?: string;
  pos?: number;
}

export interface EventInfo {
  name: string;
  /** Leading JSDoc description of the `@Component.event()` declaration, if any. */
  doc?: string;
  /** Where (and under which member identifier) the event is declared — the event
   *  NAME (`onToggle`) can differ from the member (`toggle`); jump to the member. */
  defFile?: string;
  pos?: number;
  defName?: string;
}

export interface ComponentInfo {
  tag: string;
  className: string;
  /** Absolute path of the file declaring the component (for resolving previews). */
  fileName?: string;
  /** Start offset of the class name — for go-to-definition on the tag. */
  pos?: number;
  /** Leading JSDoc description of the component class, if any. */
  doc?: string;
  /** `@preview <url>` JSDoc tag — an image shown on hover (a static screenshot,
   *  NOT a live render; the LS hover is plain markdown and can't execute JS). */
  preview?: string;
  /** `@see <url|text>` JSDoc tags — rendered as links on hover. Prefer these over
   *  `@preview` for docs/Storybook references: standard, no image hosting needed. */
  see: string[];
  props: PropInfo[];
  events: EventInfo[];
}

export type ComponentIndex = Map<string, ComponentInfo>;

interface RawClass {
  className: string;
  tag?: string;
  fileName?: string;
  pos?: number;
  /** Name of a base class to inherit props/events from (plain `extends X` or the
   *  2nd positional arg of `Component("tag", BaseClass)`). */
  baseClassName?: string;
  doc?: string;
  preview?: string;
  see: string[];
  props: PropInfo[];
  events: EventInfo[];
}

/** Trailing identifier name of a (possibly dotted) callee: `Component.prop` → "prop". */
function calleeName(tsm: typeof ts, expr: ts.Expression): string | undefined {
  if (tsm.isIdentifier(expr)) return expr.text;
  if (tsm.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

/** Texts of every occurrence of a JSDoc block tag (e.g. all `@see` lines).
 *  Reads the raw source after the tag name: `getTextOfJSDocComment` mishandles
 *  `@see <url>` (it parses the URL scheme as a name reference, dropping it). */
function jsDocTagTexts(tsm: typeof ts, node: ts.Node, tag: string): string[] {
  const out: string[] = [];
  for (const t of tsm.getJSDocTags(node)) {
    if (t.tagName.text !== tag) continue;
    const text = t
      .getText()
      .replace(/^@\w+\s*/, "") // strip the "@tag " prefix
      .replace(/\s*\n\s*\*?\s*/g, " ") // fold continuation lines
      .trim();
    if (text) out.push(text);
  }
  return out;
}

/** Text of the first occurrence of a JSDoc block tag (e.g. `@preview ./shot.png`). */
function jsDocTagText(tsm: typeof ts, node: ts.Node, tag: string): string | undefined {
  return jsDocTagTexts(tsm, node, tag)[0];
}

/** Leading JSDoc description text of a declaration (the `/** … *␣/` above it). */
function jsDocOf(tsm: typeof ts, node: ts.Node): string | undefined {
  for (const d of tsm.getJSDocCommentsAndTags(node)) {
    if (!tsm.isJSDoc(d)) continue;
    const text = typeof d.comment === "string" ? d.comment : tsm.getTextOfJSDocComment(d.comment);
    const trimmed = text?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function literalType(tsm: typeof ts, init?: ts.Expression): string | undefined {
  if (!init) return undefined;
  if (tsm.isStringLiteralLike(init)) return "string";
  if (tsm.isNumericLiteral(init)) return "number";
  if (init.kind === tsm.SyntaxKind.TrueKeyword || init.kind === tsm.SyntaxKind.FalseKeyword) return "boolean";
  if (tsm.isArrayLiteralExpression(init)) return "array";
  return undefined;
}

/** Collect `this.emit("name", …)` event names from anywhere inside a class member. */
function collectEmits(tsm: typeof ts, node: ts.Node, out: Set<string>): void {
  const visit = (n: ts.Node) => {
    if (
      tsm.isCallExpression(n) &&
      tsm.isPropertyAccessExpression(n.expression) &&
      n.expression.expression.kind === tsm.SyntaxKind.ThisKeyword &&
      n.expression.name.text === "emit"
    ) {
      const first = n.arguments[0];
      if (first && tsm.isStringLiteralLike(first)) out.add(first.text);
    }
    tsm.forEachChild(n, visit);
  };
  tsm.forEachChild(node, visit);
}

function readClass(tsm: typeof ts, node: ts.ClassLikeDeclaration, fileName: string): RawClass | undefined {
  const className = node.name?.text;
  if (!className) return undefined;

  const raw: RawClass = { className, fileName, pos: node.name?.getStart(), doc: jsDocOf(tsm, node), preview: jsDocTagText(tsm, node, "preview"), see: jsDocTagTexts(tsm, node, "see"), props: [], events: [] };
  const emits = new Set<string>();

  // ── heritage: tag + base class ──
  const ext = node.heritageClauses?.find((h) => h.token === tsm.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
  if (ext) {
    if (tsm.isCallExpression(ext)) {
      const first = ext.arguments[0];
      if (first && tsm.isStringLiteralLike(first)) raw.tag = first.text;
      // Component("tag", BaseComponent) — a positional base that's a class identifier.
      const second = ext.arguments[1];
      if (second && tsm.isIdentifier(second)) raw.baseClassName = second.text;
    } else if (tsm.isIdentifier(ext)) {
      raw.baseClassName = ext.text; // class X extends SomeComponent {}
    }
  }

  // ── members: @prop fields, @event members, this.emit() names ──
  for (const member of node.members) {
    const decorators = tsm.canHaveDecorators(member) ? tsm.getDecorators(member) : undefined;
    const memberName = member.name && tsm.isIdentifier(member.name) ? member.name.text : undefined;

    if (tsm.isMethodDeclaration(member)) collectEmits(tsm, member, emits);

    for (const dec of decorators ?? []) {
      const call = tsm.isCallExpression(dec.expression) ? dec.expression : undefined;
      const name = calleeName(tsm, call ? call.expression : dec.expression);
      if (name === "prop" && tsm.isPropertyDeclaration(member) && memberName) {
        raw.props.push({ name: memberName, type: member.type?.getText() ?? literalType(tsm, member.initializer), doc: jsDocOf(tsm, member), defFile: fileName, pos: member.name.getStart() });
      } else if (name === "event") {
        // An event name comes from: an explicit string arg (`@event("onAdd")`); an
        // options bag (`@event({ name: "onAdd", exposed })`); or a FIELD's own name
        // (`@event() onAdd` = an exposed EventEmitter). `@event()` on a METHOD with
        // no name is just auto-binding (not an event) — skip it; the emitted name
        // is picked up from its `this.emit(...)` body instead.
        const arg = call?.arguments[0];
        let evName: string | undefined;
        let exposed = true;
        if (arg && tsm.isStringLiteralLike(arg)) {
          evName = arg.text;
        } else if (arg && tsm.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) {
            if (!tsm.isPropertyAssignment(p) || !tsm.isIdentifier(p.name)) continue;
            if (p.name.text === "name" && tsm.isStringLiteralLike(p.initializer)) evName = p.initializer.text;
            else if (p.name.text === "exposed" && p.initializer.kind === tsm.SyntaxKind.FalseKeyword) exposed = false;
          }
          if (!evName && tsm.isPropertyDeclaration(member)) evName = memberName; // field name default
        } else if (tsm.isPropertyDeclaration(member)) {
          evName = memberName;
        }
        if (evName && exposed) raw.events.push({ name: evName, doc: jsDocOf(tsm, member), defFile: fileName, pos: member.name && tsm.isIdentifier(member.name) ? member.name.getStart() : undefined, defName: memberName });
      }
    }
  }
  for (const e of emits) if (!raw.events.some((ev) => ev.name === e)) raw.events.push({ name: e });
  return raw;
}

/** Build the tag→component index from a set of source files. */
export function buildComponentIndex(tsm: typeof ts, sourceFiles: readonly ts.SourceFile[]): ComponentIndex {
  const byClass = new Map<string, RawClass>();
  for (const sf of sourceFiles) {
    if (sf.isDeclarationFile) continue;
    const visit = (n: ts.Node) => {
      if (tsm.isClassDeclaration(n) || tsm.isClassExpression(n)) {
        const raw = readClass(tsm, n, sf.fileName);
        if (raw) byClass.set(raw.className, raw);
      }
      tsm.forEachChild(n, visit);
    };
    tsm.forEachChild(sf, visit);
  }

  // Resolve inheritance: merge base-class props/events down into each class.
  const resolved = new Map<string, { props: PropInfo[]; events: EventInfo[] }>();
  const resolve = (className: string, seen: Set<string>): { props: PropInfo[]; events: EventInfo[] } => {
    const cached = resolved.get(className);
    if (cached) return cached;
    const raw = byClass.get(className);
    if (!raw || seen.has(className)) return { props: [], events: [] };
    seen.add(className);
    const props = new Map<string, PropInfo>();
    const events = new Map<string, EventInfo>();
    if (raw.baseClassName) {
      const base = resolve(raw.baseClassName, seen);
      for (const p of base.props) props.set(p.name, p);
      for (const e of base.events) events.set(e.name, e);
    }
    for (const p of raw.props) props.set(p.name, p); // own overrides base
    for (const e of raw.events) events.set(e.name, e);
    const out = { props: [...props.values()], events: [...events.values()] };
    resolved.set(className, out);
    return out;
  };

  const index: ComponentIndex = new Map();
  for (const raw of byClass.values()) {
    if (!raw.tag) continue;
    const { props, events } = resolve(raw.className, new Set());
    index.set(raw.tag, { tag: raw.tag, className: raw.className, fileName: raw.fileName, pos: raw.pos, doc: raw.doc, preview: raw.preview, see: raw.see, props, events });
  }
  return index;
}
