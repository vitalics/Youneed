// ── @youneed/dom-provider-a11y/devtools — a11y capture + panel for devtools ──
//
// Two separate APIs, mirroring the devtools split between CAPTURE and DISPLAY:
//
//   • a11yPlugin() — a `DevtoolsPlugin` (capture): registered with
//     `installDevtools({ plugins })`, it records every `announce()` call;
//   • a11yPanel()  — a `DevtoolsPanel` (display): mounted with
//     `mountDevtoolsPanel({ panels })`, it shows the announcement tail and runs
//     the CSS adaptiveness audit (reduced-motion / color-scheme) over every
//     mounted component.
//
//   import { installDevtools, mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
//   import { a11yPlugin, a11yPanel } from "@youneed/dom-provider-a11y/devtools";
//
//   installDevtools({ plugins: [a11yPlugin()] });                 // capture
//   mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), a11yPanel()] }); // display
//
// The display half is free: `a11yPanel()` is one option, but the captured data
// (`a11yAnnouncements()` / `onA11yAnnouncements()`) can feed any UI.

import {
  button,
  el,
  type ComponentRecord,
  type DevtoolsContext,
  type DevtoolsPanel,
  type DevtoolsPlugin,
} from "@youneed/devtools";
import { auditStyleSheets, onAnnounce, type AnnounceEvent, type A11yAuditFinding } from "./index.ts";

// ── capture (the plugin) ──────────────────────────────────────────────────────

/** A captured announcement (an {@link AnnounceEvent} stamped with a time). */
export interface LoggedAnnouncement extends AnnounceEvent {
  time: number;
}

let capacity = 200;
const announcements: LoggedAnnouncement[] = [];
const listeners = new Set<() => void>();

function record(event: AnnounceEvent): void {
  announcements.push({ ...event, time: Date.now() });
  if (announcements.length > capacity) announcements.splice(0, announcements.length - capacity);
  for (const fn of listeners) fn();
}

/** The captured announcement log, oldest first. */
export function a11yAnnouncements(): readonly LoggedAnnouncement[] {
  return announcements;
}

/** Subscribe to announcement-log changes. Returns an unsubscribe. */
export function onA11yAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Clear the captured announcement log. */
export function clearA11yAnnouncements(): void {
  announcements.length = 0;
  for (const fn of listeners) fn();
}

/**
 * The a11y capture plugin: records every `announce()` call into a buffer the
 * panel (or any UI) can read. Register it with
 * `installDevtools({ plugins: [a11yPlugin()] })`.
 */
export function a11yPlugin(options: { capacity?: number } = {}): DevtoolsPlugin {
  if (options.capacity) capacity = options.capacity;
  return {
    name: "a11y",
    install: () => onAnnounce(record),
  };
}

// ── audit over all live components ────────────────────────────────────────────

interface ComponentAudit {
  id: number;
  tag: string;
  findings: A11yAuditFinding[];
}

// A component element exposing its scoped stylesheets (the @youneed/dom ReactiveHost).
type Styled = Element & { getStyles?: () => CSSStyleSheet[]; shadowRoot?: ShadowRoot | null };

function auditLiveComponents(ctx: DevtoolsContext): ComponentAudit[] {
  const out: ComponentAudit[] = [];
  for (const record of ctx.components()) {
    if (!record.alive) continue;
    const element = record.elRef?.deref() as Styled | undefined;
    if (!element) continue;
    const sheets = element.getStyles?.() ?? [...(element.shadowRoot?.adoptedStyleSheets ?? [])];
    const findings = auditStyleSheets(sheets, { label: `<${record.tag}>` });
    if (findings.length) out.push({ id: record.id, tag: record.tag, findings });
  }
  return out;
}

// ── accessibility tree ────────────────────────────────────────────────────────
// What assistive tech "sees": each meaningful element's role, accessible name and
// key states. A pragmatic build of the ARIA tree — implicit roles for common
// tags, the accessible-name basics (aria-label(ledby) > alt/placeholder > text),
// aria-hidden subtrees pruned, generic wrappers collapsed. Traverses shadow roots.

/** One node in the rendered accessibility tree (flattened, with tree-guide info). */
export interface A11yTreeNode {
  /** Indent depth (by emitted ancestors). */
  depth: number;
  /** Computed ARIA role (explicit `role`, else implicit from the tag). */
  role: string;
  /** Accessible name (may be empty). */
  name: string;
  /** Notable states (`expanded`, `disabled`, `level=2`, `tabindex=0`, …). */
  states: string[];
  /** The element's tag, for reference. */
  tag: string;
  /** The live element — used to highlight it on the page. */
  element: Element;
  /** Whether this node is the last among its siblings (└─ vs ├─). */
  isLast: boolean;
  /** For each ancestor level, whether that ancestor was last (→ no vertical guide). */
  guides: boolean[];
}

const ROLE_BY_TAG: Record<string, string> = {
  nav: "navigation", main: "main", header: "banner", footer: "contentinfo",
  aside: "complementary", section: "region", article: "article", form: "form",
  ul: "list", ol: "list", li: "listitem", table: "table", tr: "row", th: "columnheader",
  td: "cell", select: "combobox", textarea: "textbox", img: "img", dialog: "dialog",
  figure: "figure", output: "status", button: "button", details: "group", summary: "button",
};

const INPUT_ROLE: Record<string, string> = {
  checkbox: "checkbox", radio: "radio", range: "slider", number: "spinbutton",
  search: "searchbox", submit: "button", button: "button", reset: "button",
  email: "textbox", tel: "textbox", url: "textbox", text: "textbox", password: "textbox",
};

/** The element's ARIA role — explicit `role`, else the implicit one (or undefined
 *  for a generic container). */
export function roleOf(el: Element): string | undefined {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.trim().split(/\s+/)[0];
  const tag = el.localName;
  if (tag === "a" || tag === "area") return el.hasAttribute("href") ? "link" : undefined;
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "input") return INPUT_ROLE[(el.getAttribute("type") || "text").toLowerCase()] ?? "textbox";
  return ROLE_BY_TAG[tag];
}

const clip = (s: string): string => (s.length <= 80 ? s : `${s.slice(0, 79)}…`);

/** A pragmatic accessible name (not the full spec, but the common cases). */
export function accessibleName(el: Element): string {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const root = el.getRootNode() as ParentNode;
    const esc = (id: string): string =>
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    const text = labelledby
      .split(/\s+/)
      .map((id) => root.querySelector(`#${esc(id)}`)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return clip(text);
  }
  const label = el.getAttribute("aria-label");
  if (label?.trim()) return clip(label.trim());
  if (el.localName === "img") return clip(el.getAttribute("alt") ?? "");
  if (el.localName === "input") {
    const input = el as HTMLInputElement;
    return clip(el.getAttribute("placeholder") ?? input.value ?? "");
  }
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return clip(text);
  return el.getAttribute("title")?.trim() ? clip(el.getAttribute("title")!.trim()) : "";
}

function statesOf(el: Element): string[] {
  const states: string[] = [];
  if (/^h[1-6]$/.test(el.localName) && !el.getAttribute("role")) states.push(`level=${el.localName[1]}`);
  if (el.getAttribute("aria-level")) states.push(`level=${el.getAttribute("aria-level")}`);
  for (const attr of ["aria-expanded", "aria-pressed", "aria-checked", "aria-selected", "aria-current"]) {
    const v = el.getAttribute(attr);
    if (v != null) states.push(`${attr.slice(5)}=${v}`);
  }
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") states.push("disabled");
  const ti = el.getAttribute("tabindex");
  if (ti != null) states.push(`tabindex=${ti}`);
  return states;
}

// The render root to descend into (shadow content, else light children).
const childrenRoot = (el: Element): ParentNode => el.shadowRoot ?? el;

// A nested node before flattening — children of a "generic" (role-less) element
// are promoted to its parent, so wrappers collapse out of the tree.
interface RawNode {
  element: Element;
  role: string;
  name: string;
  states: string[];
  tag: string;
  children: RawNode[];
}

function buildNodes(node: Element): RawNode[] {
  if (node.getAttribute("aria-hidden") === "true" || node.hasAttribute("hidden")) return [];
  const children = [...childrenRoot(node).children].flatMap(buildNodes);
  const role = roleOf(node);
  const meaningful = role != null && role !== "presentation" && role !== "none" && role !== "generic";
  if (!meaningful) return children; // generic wrapper → promote its children
  return [{ element: node, role, name: accessibleName(node), states: statesOf(node), tag: node.localName, children }];
}

// Flatten the nested nodes, stamping each with its depth + tree-guide flags
// (`isLast`, and for every ancestor whether it was last → vertical-line or gap).
function flatten(nodes: RawNode[], depth: number, guides: boolean[], out: A11yTreeNode[]): void {
  nodes.forEach((n, i) => {
    const isLast = i === nodes.length - 1;
    const { element, role, name, states, tag } = n;
    out.push({ depth, role, name, states, tag, element, isLast, guides });
    flatten(n.children, depth + 1, [...guides, isLast], out);
  });
}

/** Build the accessibility tree under each root element (descending shadow roots),
 *  as a flat list with tree-guide info for indented rendering. */
export function accessibilityTree(roots: Iterable<Element>): A11yTreeNode[] {
  const out: A11yTreeNode[] = [];
  flatten([...roots].flatMap(buildNodes), 0, [], out);
  return out;
}

// The app's top-level mounted component elements (devtools' own UI sets
// `static devtools = false`, so it's never captured → never in the tree).
function appRoots(ctx: DevtoolsContext): Element[] {
  const seen = new Set<Element>();
  for (const record of ctx.components()) {
    if (!record.alive || record.parentId !== undefined) continue;
    const element = record.elRef?.deref();
    if (element && element.isConnected) seen.add(element);
  }
  return [...seen];
}

// ── panel (the display) ───────────────────────────────────────────────────────

const A11Y_CSS = `
  :host { display: block; padding: 8px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .section { margin: 10px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  button { background: #27272a; color: #d4d4d8; border: 1px solid #3a3a40; border-radius: 5px; padding: 2px 8px; cursor: pointer; font: inherit; }
  button:hover { background: #323238; }
  .muted { color: #71717a; }
  .log { max-height: 200px; overflow: auto; }
  .ann { display: flex; gap: 8px; padding: 1px 0; }
  .ann .pol { color: #93c5fd; }
  .ann.assertive .pol { color: #f87171; }
  .ann .msg { color: #e4e4e7; word-break: break-word; }
  .finding { padding: 4px 0; border-bottom: 1px solid #27272a; }
  .finding .tag { color: #fbbf24; }
  .finding .kind { color: #f87171; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; margin-left: 6px; }
  .finding .desc { color: #d4d4d8; }
  .finding a { color: #93c5fd; }
  .ok { color: #4ade80; }
  .tree { max-height: 260px; overflow: auto; }
  .node { white-space: pre; padding: 1px 4px; border-radius: 4px; cursor: default; }
  .node:hover { background: #27272a; }
  .node .guide { color: #3f3f46; }
  .node .role { color: #c084fc; }
  .node .name { color: #e4e4e7; }
  .node .name::before { content: '"'; } .node .name::after { content: '"'; }
  .node .st { color: #71717a; }
`;

/**
 * An a11y devtools panel: a live tail of captured announcements (needs
 * {@link a11yPlugin} installed) plus a CSS adaptiveness audit (reduced-motion /
 * color-scheme) over every mounted component. Returns a `DevtoolsPanel` for
 * `mountDevtoolsPanel({ panels })`.
 */
export function a11yPanel(): DevtoolsPanel {
  return {
    id: "a11y",
    title: "a11y",
    styles: A11Y_CSS,
    render(container: HTMLElement, ctx: DevtoolsContext): () => void {
      container.textContent = "";
      const treeWrap = el("div", "tree", []);
      const annList = el("div", "log", []);
      const auditList = el("div", "", []);

      container.append(
        el("div", "section", "accessibility tree"),
        treeWrap,
        el("div", "section", "announcements"),
        el("div", "row", button("clear", false, () => clearA11yAnnouncements())),
        annList,
        el("div", "section", "css audit (reduced-motion / color-scheme)"),
        auditList,
      );

      function paintTree(): void {
        treeWrap.textContent = "";
        const nodes = accessibilityTree(appRoots(ctx));
        if (!nodes.length) {
          treeWrap.appendChild(el("div", "muted", "no mounted components"));
          return;
        }
        for (const node of nodes) {
          // Tree guides: a vertical bar under each non-last ancestor, then ├─ / └─.
          const prefix =
            node.guides.map((ancestorLast) => (ancestorLast ? "   " : "│  ")).join("") +
            (node.depth > 0 ? (node.isLast ? "└─ " : "├─ ") : "");
          const row: Array<string | Node> = [el("span", "guide", prefix), el("span", "role", node.role)];
          if (node.name) row.push(" ", el("span", "name", node.name));
          if (node.states.length) row.push(" ", el("span", "st", `[${node.states.join(", ")}]`));
          const line = el("div", "node", row);
          // Highlight the element on the page while hovering its tree row.
          const record = { elRef: new WeakRef(node.element), tag: node.tag } as ComponentRecord;
          line.addEventListener("mouseenter", () => ctx.highlight(record));
          line.addEventListener("mouseleave", () => ctx.highlight(undefined));
          treeWrap.appendChild(line);
        }
      }

      function paintAnnouncements(): void {
        annList.textContent = "";
        const log = a11yAnnouncements();
        if (!log.length) {
          annList.appendChild(el("div", "muted", "no announcements captured (install a11yPlugin())"));
          return;
        }
        for (const a of [...log].reverse()) {
          annList.appendChild(
            el("div", `ann ${a.politeness}`, [
              el("span", "pol", a.politeness),
              el("span", "msg", a.message),
            ]),
          );
        }
      }

      function paintAudit(): void {
        auditList.textContent = "";
        const audited = auditLiveComponents(ctx);
        if (!audited.length) {
          auditList.appendChild(el("div", "ok", "no a11y CSS issues in mounted components"));
          return;
        }
        for (const comp of audited) {
          for (const finding of comp.findings) {
            const link = document.createElement("a");
            link.href = finding.docs;
            link.target = "_blank";
            link.textContent = "docs";
            auditList.appendChild(
              el("div", "finding", [
                el("span", "tag", `<${comp.tag}>`),
                el("span", "kind", finding.kind),
                el("div", "desc", finding.message.replace(finding.docs, "").trim()),
                link,
              ]),
            );
          }
        }
      }

      paintTree();
      paintAnnouncements();
      paintAudit();
      const offAnnounce = onA11yAnnouncements(paintAnnouncements);
      const offStore = ctx.subscribe(() => {
        paintTree();
        paintAudit();
      });
      return () => {
        offAnnounce();
        offStore();
      };
    },
  };
}
