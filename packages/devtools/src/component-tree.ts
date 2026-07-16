// component-tree.ts — the "Components" inspector, rendered with @youneed/dom
// itself (like every other plugin). A live tree (searchable, collapsible; hover
// highlights the element on the page) + a detail view (props, latest diff,
// listeners, live scheduler swap, emitted events). Selection is shared via the
// DevtoolsContext, so Time-Travel and Styles act on whatever is selected here.
//
// `static devtools = false` keeps it out of the tree it inspects; the class is
// defined lazily so importing @youneed/devtools doesn't require a DOM.

import { Component, css, html } from "@youneed/dom";
import type { Scheduler } from "@youneed/dom";
import { type ComponentRecord, componentPlugin, type DevtoolsContext, type DevtoolsPanel, type EmittedEvent, fmt } from "./core.ts";

interface TreeNode {
  record: ComponentRecord;
  children: TreeNode[];
  depth: number;
}

function buildTree(records: ComponentRecord[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>();
  for (const record of records) nodes.set(record.id, { record, children: [], depth: 0 });
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.record.parentId;
    const parent = parentId != null ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const assignDepth = (node: TreeNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);
  return roots;
}

function flattenTree(roots: TreeNode[], query: string, collapsed: Set<number>): TreeNode[] {
  const q = query.trim().toLowerCase();
  const out: TreeNode[] = [];
  const matches = (n: TreeNode) => !q || n.record.tag.toLowerCase().includes(q);
  const visit = (node: TreeNode): boolean => {
    let keptChild = false;
    const before = out.length;
    out.push(node);
    if (q || !collapsed.has(node.record.id)) {
      for (const child of node.children) keptChild = visit(child) || keptChild;
    }
    if (matches(node) || keptChild) return true;
    out.length = before;
    return false;
  };
  for (const root of roots) visit(root);
  return out;
}

function changedKeys(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(prev), ...Object.keys(next)])]
    .filter((k) => !Object.is(prev[k], next[k]))
    .sort();
}

const TREE_CSS = `
  :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .ct-toolbar { padding: 6px 8px; border-bottom: 1px solid #3a3a40; }
  .search { width: 100%; background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; padding: 3px 6px; font: inherit; }
  .search:focus { outline: none; border-color: #6366f1; }
  .ct-body { flex: 1; display: flex; min-height: 0; }
  .tree { width: 50%; overflow: auto; border-right: 1px solid #3a3a40; padding: 4px 0; }
  .detail { width: 50%; overflow: auto; padding: 6px 8px; }
  .row { display: flex; align-items: stretch; cursor: pointer; white-space: nowrap; user-select: none; min-height: 20px; }
  .row:hover { background: #2c2c33; }
  .row.selected { background: #3730a3; color: #fff; }
  .row.dead { opacity: .45; }
  .guide { flex: 0 0 14px; border-left: 1px solid #3a3a40; }
  .toggle { flex: 0 0 14px; display: flex; align-items: center; justify-content: center; color: #71717a; font-size: 9px; }
  .toggle.has:hover { color: #e4e4e7; }
  .label { display: flex; align-items: center; gap: 6px; padding: 2px 8px 2px 2px; }
  .tag { color: #93c5fd; }
  .row.selected .tag { color: #c7d2fe; }
  .id { color: #71717a; }
  .row.selected .id { color: #c7d2fe; }
  .kids { color: #52525b; }
  .section { margin: 8px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  .kv { display: flex; gap: 6px; padding: 1px 0; }
  .kv .k { color: #fbbf24; }
  .kv .v { color: #d4d4d8; word-break: break-all; }
  .lst { display: flex; gap: 6px; padding: 1px 0; }
  .lst .type { color: #f0abfc; }
  .lst .tgt { color: #93c5fd; }
  .lst .src { color: #71717a; }
  .sched { display: flex; align-items: center; gap: 6px; padding: 1px 0; flex-wrap: wrap; }
  .sched select { background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; font: inherit; padding: 1px 4px; }
  .sched .cur { color: #4ade80; }
  .sched .prio { color: #fbbf24; }
  .diff .k { color: #fbbf24; }
  .arrow { color: #71717a; }
  .old { color: #f87171; text-decoration: line-through; }
  .new { color: #4ade80; }
  .event .type { color: #f0abfc; }
  .muted { color: #71717a; }
`;

let ComponentTreeView: ReturnType<typeof defineComponentTreeView> | undefined;

function defineComponentTreeView() {
  return class ComponentTreeViewImpl extends Component("dt-component-tree") {
    static devtools = false;
    static styles = css`${TREE_CSS}`;

    @Component.prop() ctx?: DevtoolsContext;

    #search = "";
    #collapsed = new Set<number>();
    #frozen = false; // freeze re-render while the scheduler dropdown is open
    #cleanup: Array<() => void> = [];

    onMount(): void {
      const ctx = this.ctx;
      if (!ctx) return;
      this.#cleanup.push(
        ctx.subscribe(() => {
          if (!this.#frozen) this.requestUpdate();
        }),
      );
      this.#cleanup.push(ctx.onSelect(() => this.requestUpdate()));
      // Settings changed (highlight / events order / limit): re-render the detail
      // and refresh the overlay (clears it when highlight is turned off).
      this.#cleanup.push(
        ctx.onSettingsChange(() => {
          this.requestUpdate();
          this.#hl(ctx.current());
        }),
      );
    }

    onUnmount(): void {
      for (const fn of this.#cleanup) fn();
      this.#cleanup = [];
      this.ctx?.highlight(undefined);
    }

    /** Highlight `rec` on the page — gated by this plugin's "highlight" toggle. */
    #hl(rec: ComponentRecord | undefined): void {
      this.ctx?.highlight(this.ctx.setting("highlight") ? rec : undefined);
    }

    /** Emitted events shaped by the "events" settings (overwrite / order / limit). */
    #orderedEvents(rec: ComponentRecord, ctx: DevtoolsContext): EmittedEvent[] {
      let events = rec.events;
      // "Overwrite repeats": keep only the latest event per type (re-ordered to
      // its last occurrence) instead of every occurrence.
      if (ctx.setting("eventsOverwrite")) {
        const byType = new Map<string, EmittedEvent>();
        for (const e of events) {
          byType.delete(e.type);
          byType.set(e.type, e);
        }
        events = [...byType.values()];
      }
      // Stored oldest→newest; reverse for newest-first (the default).
      const ordered = ctx.setting<string>("eventsOrder") === "oldest" ? [...events] : [...events].reverse();
      const limit = Number(ctx.setting<string>("eventsLimit"));
      return limit > 0 ? ordered.slice(0, limit) : ordered;
    }

    #toggle(id: number): void {
      if (this.#collapsed.has(id)) this.#collapsed.delete(id);
      else this.#collapsed.add(id);
      this.requestUpdate();
    }

    #rowOf(node: TreeNode, selectedId: number | null, ctx: DevtoolsContext) {
      const rec = node.record;
      const hasKids = node.children.length > 0;
      const searching = this.#search.trim() !== "";
      const isCollapsed = hasKids && !searching && this.#collapsed.has(rec.id);
      const cls = "row" + (rec.id === selectedId ? " selected" : "") + (rec.alive ? "" : " dead");
      return html`
        <div
          class=${cls}
          @click=${() => ctx.select(rec.id)}
          @mouseenter=${() => this.#hl(rec)}
          @mouseleave=${() => this.#hl(ctx.current())}
        >
          ${Array.from({ length: node.depth }, () => html`<span class="guide"></span>`)}
          <span
            class=${hasKids ? "toggle has" : "toggle"}
            @click=${(e: Event) => {
              if (hasKids) {
                e.stopPropagation();
                this.#toggle(rec.id);
              }
            }}
            >${hasKids ? (isCollapsed ? "▶" : "▼") : ""}</span
          >
          <span class="label">
            <span class="tag">${`<${rec.tag}>`}</span>
            <span class="id">${`#${rec.id}${rec.alive ? "" : " ⚰"}`}</span>
            ${isCollapsed ? html`<span class="kids">… ${node.children.length}</span>` : html``}
          </span>
        </div>
      `;
    }

    #detail(ctx: DevtoolsContext) {
      const rec = ctx.current();
      if (!rec) return html`<div class="muted">select a component</div>`;

      const node = rec.elRef?.deref() as { setScheduler?: (s?: Scheduler) => void } | undefined;
      const canSwap = rec.alive && typeof node?.setScheduler === "function";
      const choices = ctx.schedulerChoices();
      const activeIdx = Math.max(0, choices.findIndex((c) => c.label === rec.scheduler));

      const propKeys = Object.keys(rec.props);
      const n = rec.history.length;
      const diff = n > 1 ? changedKeys(rec.history[n - 2].props, rec.history[n - 1].props) : [];

      return html`
        <div class="section">${`<${rec.tag}> #${rec.id}${rec.alive ? "" : " — unmounted"}`}</div>

        <div class="section">scheduling</div>
        <div class="sched">
          <span class="k">scheduler:</span>
          <span class="cur">${rec.scheduler ?? "?"}</span>
          <select
            .value=${String(activeIdx)}
            .disabled=${!canSwap}
            @focus=${() => (this.#frozen = true)}
            @blur=${() => {
              this.#frozen = false;
              this.requestUpdate();
            }}
            @change=${(e: Event) => node?.setScheduler?.(choices[Number((e.target as HTMLSelectElement).value)]?.make())}
          >
            ${choices.map((c, i) => html`<option value=${i}>${c.label}</option>`)}
          </select>
        </div>
        <div class="sched"><span class="k">priority:</span><span class="prio">${rec.priority ?? "?"}</span></div>

        <div class="section">props</div>
        ${propKeys.length === 0
          ? html`<div class="muted">—</div>`
          : propKeys.map((k) => html`<div class="kv"><span class="k">${`${k}:`}</span><span class="v">${fmt(rec.props[k])}</span></div>`)}

        ${diff.length > 0
          ? html`
              <div class="section">latest change</div>
              <div class="diff">
                ${diff.map(
                  (k) => html`
                    <div class="kv">
                      <span class="k">${`${k}:`}</span>
                      <span class="old">${fmt(rec.history[n - 2].props[k])}</span>
                      <span class="arrow">→</span>
                      <span class="new">${fmt(rec.history[n - 1].props[k])}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : html``}

        <div class="section">${`exposed events (${rec.exposed.length})`}</div>
        ${rec.exposed.length === 0
          ? html`<div class="muted">—</div>`
          : rec.exposed.map(
              (name) => html`<div class="event"><span class="type">${`@${name}`}</span><span class="src">· bind in parent template</span></div>`,
            )}

        <div class="section">${`listeners (${rec.listeners.length})`}</div>
        ${rec.listeners.length === 0
          ? html`<div class="muted">—</div>`
          : rec.listeners.map(
              (l) => html`<div class="lst"><span class="type">${l.type}</span><span class="tgt">${`on ${l.target}`}</span><span class="src">${`· ${l.source}`}</span></div>`,
            )}

        ${rec.events.length > 0
          ? (() => {
              const shown = this.#orderedEvents(rec, ctx);
              const suffix = shown.length < rec.events.length ? ` — showing ${shown.length}` : "";
              return html`
                <div class="section">${`emitted events (${rec.events.length}${suffix})`}</div>
                ${shown.map(
                  (e) => html`<div class="event"><span class="type">${`↑ ${e.type}`}</span><span class="v">${`: ${fmt(e.detail)}`}</span></div>`,
                )}
              `;
            })()
          : html``}
      `;
    }

    override render() {
      const ctx = this.ctx;
      if (!ctx) return html``;
      const rows = flattenTree(buildTree(ctx.components()), this.#search, this.#collapsed);
      const selectedId = ctx.selected();
      return html`
        <div class="ct-toolbar">
          <input
            class="search"
            placeholder="search tree…"
            @input=${(e: Event) => {
              this.#search = (e.target as HTMLInputElement).value;
              this.requestUpdate();
            }}
          />
        </div>
        <div class="ct-body">
          <div class="tree">${rows.map((node) => this.#rowOf(node, selectedId, ctx))}</div>
          <div class="detail">${this.#detail(ctx)}</div>
        </div>
      `;
    }
  };
}

/** The built-in component inspector plugin (built with @youneed/dom). */
export function componentTreePanel(): DevtoolsPanel {
  ComponentTreeView ??= defineComponentTreeView();
  return {
    ...componentPlugin("components", "Components", ComponentTreeView),
    settings: [
      { id: "highlight", label: "Highlight element on hover / select", default: true },
      {
        id: "eventsOrder",
        label: "Events order",
        type: "select",
        default: "newest",
        options: [
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" },
        ],
      },
      { id: "eventsOverwrite", label: "Collapse repeated events (keep latest)", default: false },
      {
        id: "eventsLimit",
        label: "Max events shown",
        type: "select",
        default: "25",
        options: [
          { value: "10", label: "10" },
          { value: "25", label: "25" },
          { value: "50", label: "50" },
          { value: "0", label: "All" },
        ],
      },
    ],
  };
}
