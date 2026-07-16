// HTML context detection inside an html`` template + completion building.
// A tiny forward scanner over the raw text up to the cursor figures out whether
// we're typing a tag name or an attribute (and, if so, the prefix `.`/`@`/`?`).
// `${…}` holes are skipped as opaque. From that context we offer:
//   • tag names   → known custom-element tags + a few common HTML tags
//   • `.attr`     → the element's @prop fields
//   • `@attr`     → the element's events (declared / emitted) + common DOM events
//   • bare attr   → both `.props` and `@events` of the element + common attributes
import type * as ts from "typescript";
import type { ComponentIndex } from "./component-index.ts";
import { skipHole, type TemplateMatch } from "./template.ts";

const COMMON_TAGS = ["div", "span", "p", "a", "ul", "ol", "li", "button", "input", "label", "form", "img", "section", "header", "footer", "nav", "slot", "template", "style", "h1", "h2", "h3", "table", "tr", "td", "th"];
const COMMON_ATTRS = ["class", "id", "style", "title", "href", "src", "type", "name", "value", "placeholder", "disabled", "hidden", "slot", "part", "role", "aria-label", "tabindex"];
const COMMON_EVENTS = ["click", "input", "change", "submit", "keydown", "keyup", "focus", "blur", "pointerdown", "pointerup", "mouseenter", "mouseleave"];

const isWs = (c: string) => c === " " || c === "\n" || c === "\t" || c === "\r";
const isNameChar = (c: string) => /[A-Za-z0-9-]/.test(c);

// ── MDN reference docs for the built-in (non-component) entries ──────────────────
// These aren't authored in the project, so instead of project JSDoc we attach a
// "standard …" note plus a link to MDN. Editors linkify the bare URL in the
// completion-details popup.
const MDN = "https://developer.mozilla.org/en-US/docs/Web";
const GLOBAL_ATTRS = new Set(["class", "id", "style", "title", "slot", "part", "hidden", "tabindex"]);

const mdnEventUrl = (e: string) => `${MDN}/API/Element/${e}_event`;
const mdnTagUrl = (t: string) => `${MDN}/HTML/Element/${t}`;
const mdnAttrUrl = (a: string): string => {
  if (a === "role") return `${MDN}/Accessibility/ARIA/Roles`;
  if (a.startsWith("aria-")) return `${MDN}/Accessibility/ARIA/Attributes/${a}`;
  if (GLOBAL_ATTRS.has(a)) return `${MDN}/HTML/Global_attributes/${a}`;
  return `${MDN}/HTML/Attributes/${a}`;
};
/** "Standard …" note + MDN link, shown for built-in events / attributes / tags. */
const standardDoc = (kind: string, url: string) => `Standard ${kind}.\n\nMDN: ${url}`;

export type HtmlContext =
  | { type: "tagname"; word: string; replaceFrom: number }
  | { type: "attr"; tag: string; prefix: "." | "@" | "?" | ""; word: string; replaceFrom: number }
  | { type: "value" }
  | { type: "text" };

/** Scan raw[0..cursorRel) and report the HTML context at the cursor. */
export function htmlContextAt(raw: string, cursorRel: number): HtmlContext {
  let mode: "text" | "tag" | "closing" = "text";
  let tag = "";
  let afterName = false;
  let inValue = false;
  let quote = "";
  let tokenStart = 0;
  let i = 0;

  while (i < cursorRel) {
    const c = raw[i];
    if (c === "$" && raw[i + 1] === "{") {
      const end = skipHole(raw, i);
      if (cursorRel > i && cursorRel < end) return { type: "value" }; // cursor inside ${…} → defer to TS
      i = end;
      tokenStart = i;
      if (inValue && !quote) inValue = false; // `=${x}` ends an unquoted value
      continue;
    }
    if (mode === "closing") {
      if (c === ">") mode = "text";
      i++;
      continue;
    }
    if (mode === "text") {
      if (c === "<") {
        if (raw[i + 1] === "/") {
          mode = "closing";
        } else {
          mode = "tag";
          tag = "";
          afterName = false;
          inValue = false;
          tokenStart = i + 1;
        }
      }
      i++;
      continue;
    }
    // mode === "tag"
    if (inValue) {
      if (quote) {
        if (c === quote) {
          inValue = false;
          quote = "";
        }
      } else if (isWs(c)) {
        inValue = false;
        tokenStart = i + 1;
      } else if (c === ">") {
        mode = "text";
      }
      i++;
      continue;
    }
    if (c === ">") {
      mode = "text";
      i++;
      continue;
    }
    if (!afterName) {
      if (isWs(c) || c === "/") {
        afterName = true;
        tokenStart = i + 1;
      } else {
        tag += c;
      }
      i++;
      continue;
    }
    // attribute area
    if (isWs(c) || c === "/") {
      tokenStart = i + 1;
      i++;
      continue;
    }
    if (c === "=") {
      inValue = true;
      const n = raw[i + 1];
      if (n === '"' || n === "'") {
        quote = n;
        i += 2;
      } else {
        quote = "";
        i++;
      }
      tokenStart = i;
      continue;
    }
    i++;
  }

  if (mode === "tag" && inValue) return { type: "value" };
  if (mode === "tag" && !afterName) return { type: "tagname", word: raw.slice(tokenStart, cursorRel), replaceFrom: tokenStart };
  if (mode === "tag" && afterName) {
    const token = raw.slice(tokenStart, cursorRel);
    const first = token[0];
    if (first === "." || first === "@" || first === "?") {
      return { type: "attr", tag, prefix: first, word: token.slice(1), replaceFrom: tokenStart + 1 };
    }
    return { type: "attr", tag, prefix: "", word: token, replaceFrom: tokenStart };
  }
  return { type: "text" };
}

// ── Binding diagnostics (type-safe `.prop` / `@event` bindings) ─────────────────

interface Binding {
  tag: string;
  prefix: "." | "@" | "?" | "";
  name: string;
  /** Offset of the name (after the prefix char) within `raw`. */
  nameStart: number;
}

/** Enumerate every `.prop` / `@event` / `?attr` binding in a template (with
 *  positions). Same forward scan as `htmlContextAt`, but over the whole text. */
export function scanBindings(raw: string): Binding[] {
  const out: Binding[] = [];
  let mode: "text" | "tag" | "closing" = "text";
  let tag = "";
  let afterName = false;
  let inValue = false;
  let quote = "";
  let tokenStart = 0;

  const flush = (end: number) => {
    const tok = raw.slice(tokenStart, end);
    const p = tok[0];
    if (tok.length > 1 && (p === "." || p === "@" || p === "?")) {
      out.push({ tag, prefix: p, name: tok.slice(1), nameStart: tokenStart + 1 });
    }
  };

  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "$" && raw[i + 1] === "{") {
      const end = skipHole(raw, i);
      if (inValue && !quote) inValue = false; // `=${x}` closes an unquoted value
      i = end;
      tokenStart = i;
      continue;
    }
    if (mode === "closing") {
      if (c === ">") mode = "text";
      i++;
      continue;
    }
    if (mode === "text") {
      if (c === "<") {
        if (raw[i + 1] === "/") mode = "closing";
        else {
          mode = "tag";
          tag = "";
          afterName = false;
          inValue = false;
          tokenStart = i + 1;
        }
      }
      i++;
      continue;
    }
    // mode === "tag"
    if (inValue) {
      if (quote) {
        if (c === quote) { inValue = false; quote = ""; tokenStart = i + 1; }
      } else if (isWs(c)) { inValue = false; tokenStart = i + 1; }
      else if (c === ">") { inValue = false; mode = "text"; }
      i++;
      continue;
    }
    if (c === ">") { flush(i); mode = "text"; i++; continue; }
    if (!afterName) {
      if (isWs(c) || c === "/") { afterName = true; tokenStart = i + 1; }
      else tag += c;
      i++;
      continue;
    }
    // attribute area
    if (isWs(c) || c === "/") { flush(i); tokenStart = i + 1; i++; continue; }
    if (c === "=") {
      flush(i);
      inValue = true;
      const n = raw[i + 1];
      if (n === '"' || n === "'") { quote = n; i += 2; } else { quote = ""; i++; }
      tokenStart = i;
      continue;
    }
    i++;
  }
  return out;
}

export interface TagOccurrence {
  tag: string;
  /** Offset of the tag NAME within `raw` (just after the opening `<`). */
  start: number;
}

/** Enumerate opening-tag names in a template (with positions). Tag names always
 *  start at `<` + name char; `${…}` holes are skipped, so a `<` inside a hole or
 *  a non-tag `<` in text yields nothing useful (and won't resolve to a tag). */
export function scanTags(raw: string): TagOccurrence[] {
  const out: TagOccurrence[] = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    if (raw[i] === "$" && raw[i + 1] === "{") { i = skipHole(raw, i); continue; }
    if (raw[i] === "<" && raw[i + 1] !== "/" && raw[i + 1] !== "!") {
      let j = i + 1;
      let name = "";
      while (j < n && isNameChar(raw[j])) { name += raw[j]; j++; }
      if (name) out.push({ tag: name, start: i + 1 });
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

export interface BindingDiagnostic {
  start: number; // file-relative
  length: number;
  messageText: string;
  /** `prop` → an error; `event` → a warning (event detection can be incomplete). */
  kind: "prop" | "event";
}

/** Flag `.prop`/`@event` bindings on KNOWN components that aren't part of their
 *  declared surface. Unknown tags (plain HTML / third-party) are left alone. */
export function checkBindings(raw: string, base: number, index: ComponentIndex): BindingDiagnostic[] {
  const diags: BindingDiagnostic[] = [];
  for (const b of scanBindings(raw)) {
    const comp = index.get(b.tag);
    if (!comp || !b.name) continue;
    if (b.prefix === "." || b.prefix === "?") {
      if (!comp.props.some((p) => p.name === b.name)) {
        diags.push({
          start: base + b.nameStart,
          length: b.name.length,
          kind: "prop",
          messageText: `Property '${b.name}' is not declared on <${comp.tag}>. Add '@Component.prop() ${b.name}' to ${comp.className}.`,
        });
      }
    } else if (b.prefix === "@") {
      if (!comp.events.some((e) => e.name === b.name) && !COMMON_EVENTS.includes(b.name)) {
        diags.push({
          start: base + b.nameStart,
          length: b.name.length,
          kind: "event",
          messageText: `Event '${b.name}' is not exposed by <${comp.tag}>. Declare it with '@Component.event' on ${comp.className} (or emit it via this.emit).`,
        });
      }
    }
  }
  return diags;
}

export interface Entry {
  name: string;
  insertText?: string;
  kind: ts.ScriptElementKind;
  detail: string;
  /** JSDoc text from the source declaration — shown in the completion-details popup. */
  doc?: string;
}

function toCompletionInfo(tsm: typeof ts, match: TemplateMatch, replaceFrom: number, cursorRel: number, entries: Entry[]): ts.CompletionInfo {
  const span: ts.TextSpan = { start: match.base + replaceFrom, length: cursorRel - replaceFrom };
  return {
    isGlobalCompletion: false,
    isMemberCompletion: false,
    isNewIdentifierLocation: true,
    entries: entries.map((e, i) => ({
      name: e.name,
      kind: e.kind,
      kindModifiers: "",
      sortText: `0${String(i).padStart(4, "0")}`,
      insertText: e.insertText ?? e.name,
      replacementSpan: span,
      labelDetails: { description: e.detail },
    })),
  };
}

/** The raw entry list for an html`` template at the cursor (with replaceFrom), or
 *  undefined to defer to TS. Shared by completions and completion-entry details. */
export function buildHtmlEntries(
  tsm: typeof ts,
  match: TemplateMatch,
  index: ComponentIndex,
): { replaceFrom: number; entries: Entry[] } | undefined {
  const ctx = htmlContextAt(match.raw, match.cursorRel);
  const K = tsm.ScriptElementKind;

  if (ctx.type === "tagname") {
    const entries: Entry[] = [];
    for (const c of index.values()) entries.push({ name: c.tag, kind: K.classElement, detail: `<${c.tag}> (${c.className})`, doc: c.doc });
    for (const t of COMMON_TAGS) entries.push({ name: t, kind: K.keyword, detail: "HTML element", doc: standardDoc("HTML element", mdnTagUrl(t)) });
    return { replaceFrom: ctx.replaceFrom, entries };
  }

  if (ctx.type === "attr") {
    const comp = index.get(ctx.tag);
    const entries: Entry[] = [];
    if (ctx.prefix === ".") {
      for (const p of comp?.props ?? []) entries.push({ name: p.name, insertText: `${p.name}=`, kind: K.memberVariableElement, detail: `prop${p.type ? `: ${p.type}` : ""}`, doc: p.doc });
    } else if (ctx.prefix === "@") {
      const declared = comp?.events ?? [];
      const declaredNames = new Set(declared.map((e) => e.name));
      for (const e of declared) entries.push({ name: e.name, insertText: `${e.name}=`, kind: K.functionElement, detail: "component event", doc: e.doc });
      for (const e of COMMON_EVENTS) if (!declaredNames.has(e)) entries.push({ name: e, insertText: `${e}=`, kind: K.functionElement, detail: "DOM event", doc: standardDoc("DOM event", mdnEventUrl(e)) });
    } else if (ctx.prefix === "?") {
      for (const p of comp?.props ?? []) entries.push({ name: p.name, insertText: `${p.name}=`, kind: K.memberVariableElement, detail: "boolean prop", doc: p.doc });
    } else {
      // bare attribute name — offer the punctuated forms + common attributes
      for (const p of comp?.props ?? []) entries.push({ name: `.${p.name}`, insertText: `.${p.name}=`, kind: K.memberVariableElement, detail: `prop${p.type ? `: ${p.type}` : ""}`, doc: p.doc });
      for (const e of comp?.events ?? []) entries.push({ name: `@${e.name}`, insertText: `@${e.name}=`, kind: K.functionElement, detail: "component event", doc: e.doc });
      for (const a of COMMON_ATTRS) entries.push({ name: a, kind: K.keyword, detail: "attribute", doc: standardDoc("HTML attribute", mdnAttrUrl(a)) });
    }
    if (!entries.length) return undefined;
    return { replaceFrom: ctx.replaceFrom, entries };
  }

  return undefined;
}

/** Build completions for an html`` template at the cursor, or undefined to defer. */
export function htmlCompletions(tsm: typeof ts, match: TemplateMatch, index: ComponentIndex): ts.CompletionInfo | undefined {
  const built = buildHtmlEntries(tsm, match, index);
  if (!built) return undefined;
  return toCompletionInfo(tsm, match, built.replaceFrom, match.cursorRel, built.entries);
}

/** The entry our completion produced for `entryName` at the cursor (carries its
 *  JSDoc `doc`), or undefined. Lets the LS render details/documentation popups. */
export function htmlEntryDetail(tsm: typeof ts, match: TemplateMatch, index: ComponentIndex, entryName: string): Entry | undefined {
  return buildHtmlEntries(tsm, match, index)?.entries.find((e) => e.name === entryName);
}

// ── Hover / quick-info over a `.prop` / `@event` binding ────────────────────────

export interface HtmlQuickInfo {
  /** File-relative span of the binding NAME (the part under the cursor). */
  start: number;
  length: number;
  kind: ts.ScriptElementKind;
  /** Signature line, e.g. "(property) text: string". */
  detail: string;
  /** JSDoc (component members) or the "standard … + MDN" note (built-ins). */
  doc?: string;
  /** `@preview <url>` of a component (tag hover only) — rendered as an image. */
  preview?: string;
  /** `@see <url|text>` of a component (tag hover only) — rendered as links. */
  see?: string[];
  /** The hovered component's tag + defining file — lets the plugin auto-resolve a
   *  generated screenshot by convention when there's no explicit `@preview`. */
  tag?: string;
  tagFileName?: string;
}

/** Resolve a binding to its display info: a declared prop/event carries its JSDoc;
 *  a standard DOM event / attribute carries the "standard … + MDN" note. */
function resolveBindingDoc(tsm: typeof ts, b: Binding, index: ComponentIndex): Omit<HtmlQuickInfo, "start" | "length"> | undefined {
  const K = tsm.ScriptElementKind;
  const comp = index.get(b.tag);
  if (b.prefix === "." || b.prefix === "?") {
    const p = comp?.props.find((pp) => pp.name === b.name);
    if (p) return { kind: K.memberVariableElement, detail: `(property) ${p.name}${p.type ? `: ${p.type}` : ""}`, doc: p.doc };
    return undefined;
  }
  if (b.prefix === "@") {
    const ev = comp?.events.find((e) => e.name === b.name);
    if (ev) return { kind: K.functionElement, detail: `(event) ${ev.name}`, doc: ev.doc };
    if (COMMON_EVENTS.includes(b.name)) return { kind: K.functionElement, detail: `(DOM event) ${b.name}`, doc: standardDoc("DOM event", mdnEventUrl(b.name)) };
    return undefined;
  }
  return undefined;
}

// ── Go-to-definition over a tag name / `.prop` / `@event` ───────────────────────

export interface HtmlDefinition {
  /** File-relative span of the token under the cursor (the editor highlights it). */
  boundStart: number;
  boundLength: number;
  kind: "tag" | "prop" | "event";
  /** Where the declaration lives (a component class, a `@prop`/`@event` member). */
  target: { fileName: string; pos: number; name: string; container: string };
}

/** Resolve the declaration a tag / binding under the cursor points at, or undefined
 *  (cursor elsewhere, unknown component, or declaration with no source position). */
export function htmlDefinitionAt(match: TemplateMatch, index: ComponentIndex): HtmlDefinition | undefined {
  // tag name → the component class
  for (const t of scanTags(match.raw)) {
    if (match.cursorRel < t.start || match.cursorRel > t.start + t.tag.length) continue;
    const comp = index.get(t.tag);
    if (!comp?.fileName || comp.pos == null) return undefined;
    return { boundStart: match.base + t.start, boundLength: t.tag.length, kind: "tag", target: { fileName: comp.fileName, pos: comp.pos, name: comp.className, container: comp.tag } };
  }
  // binding name → the @prop field / @event member
  for (const b of scanBindings(match.raw)) {
    if (match.cursorRel < b.nameStart || match.cursorRel > b.nameStart + b.name.length) continue;
    const comp = index.get(b.tag);
    if (!comp) return undefined;
    const bound = { boundStart: match.base + b.nameStart, boundLength: b.name.length };
    if (b.prefix === "." || b.prefix === "?") {
      const p = comp.props.find((pp) => pp.name === b.name);
      if (!p?.defFile || p.pos == null) return undefined;
      return { ...bound, kind: "prop", target: { fileName: p.defFile, pos: p.pos, name: p.name, container: comp.className } };
    }
    if (b.prefix === "@") {
      const e = comp.events.find((ev) => ev.name === b.name);
      if (!e?.defFile || e.pos == null) return undefined;
      return { ...bound, kind: "event", target: { fileName: e.defFile, pos: e.pos, name: e.defName ?? e.name, container: comp.className } };
    }
  }
  return undefined;
}

/** Quick-info for a tag name / `.prop` / `@event` under the cursor, or undefined
 *  to defer to TS (e.g. the cursor is inside a `${…}` value expression). */
export function htmlQuickInfoAt(tsm: typeof ts, match: TemplateMatch, index: ComponentIndex): HtmlQuickInfo | undefined {
  const K = tsm.ScriptElementKind;
  // 1) over a tag name → the component (class JSDoc) or a standard HTML element.
  for (const t of scanTags(match.raw)) {
    if (match.cursorRel < t.start || match.cursorRel > t.start + t.tag.length) continue;
    const comp = index.get(t.tag);
    if (comp) return { start: match.base + t.start, length: t.tag.length, kind: K.classElement, detail: `(component) <${comp.tag}> — ${comp.className}`, doc: comp.doc, preview: comp.preview, see: comp.see, tag: comp.tag, tagFileName: comp.fileName };
    if (COMMON_TAGS.includes(t.tag)) return { start: match.base + t.start, length: t.tag.length, kind: K.keyword, detail: `<${t.tag}> (HTML element)`, doc: standardDoc("HTML element", mdnTagUrl(t.tag)) };
    return undefined;
  }
  // 2) over a binding name → its prop/event doc.
  for (const b of scanBindings(match.raw)) {
    if (match.cursorRel < b.nameStart || match.cursorRel > b.nameStart + b.name.length) continue;
    const resolved = resolveBindingDoc(tsm, b, index);
    if (resolved) return { start: match.base + b.nameStart, length: b.name.length, ...resolved };
  }
  return undefined;
}
