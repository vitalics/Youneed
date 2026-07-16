// shad <shad-data-table> — a full data grid built on the table primitives.
// Data-driven: give it `columns` + `data` and turn features on with flags.
//   const t = document.querySelector("shad-data-table");
//   t.columns = [
//     { key: "status", header: "Status", class: "capitalize" },
//     { key: "email",  header: "Email", sortable: true, filterable: true, class: "lowercase" },
//     { key: "amount", header: "Amount", align: "end",
//       cell: (r) => `$${r.amount.toFixed(2)}`, class: "text-right font-medium" },
//   ];
//   t.data = rows;
//
// Features (all optional): row selection (`selectable`), a toolbar filter input
// (any `filterable` column), a Columns visibility menu (`show-columns`), per-row
// actions (`rowActions`), client-side sorting (`sortable` columns) and
// pagination (`page-size`). Emits `selectionchange`, `rowaction`, `sortchange`.

import { Component, html, css, map, when, type OnMount, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";
import "./table.ts";
import "./checkbox.ts";
import "./input.ts";
import "./button.ts";

export interface DataTableColumn<T = Record<string, unknown>> {
  /** Field key on each row. */
  key: string;
  /** Column label shown in the header. */
  header: string;
  /** Sortable column → clickable header that toggles asc/desc. */
  sortable?: boolean;
  /** Text alignment for header + cells. */
  align?: "start" | "center" | "end";
  /** Custom cell renderer; receives the row. Falls back to `row[key]`. */
  cell?: (row: T) => TemplateResult | string | number;
  /** Class on the cell content wrapper (e.g. "capitalize", "text-right font-medium"). */
  class?: string;
  /** Listed in the Columns visibility menu (and hidable). */
  hideable?: boolean;
  /** The toolbar filter input filters on this column (first one wins). */
  filterable?: boolean;
}

export interface RowAction {
  label?: string;
  value?: string;
  destructive?: boolean;
  separator?: boolean;
}

const ARROW_UP_DOWN = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>`;
const ARROW_UP = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>`;
const ARROW_DOWN = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>`;
const CHEVRON_DOWN = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;
const ELLIPSIS = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>`;
const CHECK = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;

@Component.define()
export class ShadDataTable extends Component("shad-data-table") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: block; width: 100%; }
      /* The little dropdown panels (Columns toggle, row actions). */
      .menu {
        position: absolute;
        z-index: 50;
        min-width: 8rem;
        border-radius: 0.375rem;
        border: 1px solid hsl(var(--border));
        background: hsl(var(--popover));
        color: hsl(var(--popover-foreground));
        padding: 0.25rem;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      }
    `,
  ];

  @Component.prop() columns: DataTableColumn[] = [];
  @Component.prop() data: Record<string, unknown>[] = [];
  /** Per-row actions menu (an ellipsis button). Empty → no actions column. */
  @Component.prop() rowActions: RowAction[] = [];
  /** Stable id field for selection; falls back to a JSON key of the row. */
  @Component.prop({ attribute: true }) rowKey = "";
  @Component.prop({ attribute: true }) selectable = false;
  @Component.prop({ attribute: "show-columns" }) showColumns = false;
  @Component.prop({ attribute: "page-size" }) pageSize = 0;
  @Component.prop({ attribute: true }) filterPlaceholder = "";

  #sortKey = this.signal("");
  #sortDir = this.signal<"asc" | "desc">("asc");
  #filter = this.signal("");
  #page = this.signal(0);
  #selected = this.signal(new Set<string>());
  #hidden = this.signal(new Set<string>());
  #columnsOpen = this.signal(false);
  #actionRow = this.signal(-1); // index (within current view) of the open row-action menu
  #actionX = this.signal(0); // viewport coords of the open row-action menu (position:fixed)
  #actionY = this.signal(0);

  onMount(): void {
    // Close any open dropdown on an outside click; reposition on scroll/resize.
    document.addEventListener(
      "click",
      (e) => {
        if (!e.composedPath().includes(this)) {
          this.#columnsOpen.set(false);
          this.#actionRow.set(-1);
        }
      },
      { signal: this.abortSignal },
    );
    // The row-action menu is position:fixed, so close it when the page scrolls.
    addEventListener("scroll", () => this.#actionRow.set(-1), { capture: true, passive: true, signal: this.abortSignal });
  }

  // ---- row identity / data pipeline -------------------------------------

  #idOf(row: Record<string, unknown>): string {
    if (this.rowKey && row[this.rowKey] != null) return String(row[this.rowKey]);
    return JSON.stringify(row);
  }
  #filterCol(): DataTableColumn | undefined {
    return this.columns.find((c) => c.filterable);
  }
  /** Filtered + sorted rows (the full result set, before pagination). */
  #view(): Record<string, unknown>[] {
    let rows = this.data;
    const fc = this.#filterCol();
    const q = this.#filter().toLowerCase();
    if (fc && q) rows = rows.filter((r) => String(r[fc.key] ?? "").toLowerCase().includes(q));
    const sk = this.#sortKey();
    if (sk) {
      const dir = this.#sortDir() === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = a[sk] as never, bv = b[sk] as never;
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
    }
    return rows;
  }
  /** The rows for the current page. */
  #pageRows(view: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.pageSize) return view;
    const start = this.#page() * this.pageSize;
    return view.slice(start, start + this.pageSize);
  }
  #visibleColumns(): DataTableColumn[] {
    const hidden = this.#hidden();
    return this.columns.filter((c) => !hidden.has(c.key));
  }

  // ---- actions ----------------------------------------------------------

  #toggleSort(c: DataTableColumn): void {
    if (!c.sortable) return;
    if (this.#sortKey() === c.key) this.#sortDir.set(this.#sortDir() === "asc" ? "desc" : "asc");
    else (this.#sortKey.set(c.key), this.#sortDir.set("asc"));
    this.emit("sortchange", { key: this.#sortKey(), dir: this.#sortDir() });
  }
  #toggleRow(row: Record<string, unknown>): void {
    const id = this.#idOf(row);
    const next = new Set(this.#selected());
    next.has(id) ? next.delete(id) : next.add(id);
    this.#selected.set(next);
    this.#emitSelection();
  }
  #toggleAll(view: Record<string, unknown>[]): void {
    const ids = view.map((r) => this.#idOf(r));
    const allOn = ids.length > 0 && ids.every((id) => this.#selected().has(id));
    const next = new Set(this.#selected());
    if (allOn) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    this.#selected.set(next);
    this.#emitSelection();
  }
  #emitSelection(): void {
    const sel = this.#selected();
    this.emit("selectionchange", this.data.filter((r) => sel.has(this.#idOf(r))));
  }
  #toggleColumn(key: string): void {
    const next = new Set(this.#hidden());
    next.has(key) ? next.delete(key) : next.add(key);
    this.#hidden.set(next);
  }
  #runAction(a: RowAction, row: Record<string, unknown>): void {
    this.#actionRow.set(-1);
    this.emit("rowaction", { action: a.value ?? a.label, row });
  }

  // ---- render -----------------------------------------------------------

  override render() {
    const view = this.#view();
    const rows = this.#pageRows(view);
    const cols = this.#visibleColumns();
    const fc = this.#filterCol();
    const hasActions = this.rowActions.length > 0;

    const pageCount = this.pageSize ? Math.max(1, Math.ceil(view.length / this.pageSize)) : 1;
    const page = this.#page();
    const selCount = this.#selected().size;
    const allOn = view.length > 0 && view.every((r) => this.#selected().has(this.#idOf(r)));

    return html`
      ${when(fc || this.showColumns, () => this.#toolbar(fc))}
      <div class="overflow-hidden rounded-md border border-border bg-background">
        <shad-table>
          <shad-table-header>
            <shad-table-row>
              ${when(
                this.selectable,
                () => html`<shad-table-head>
                  <shad-checkbox
                    aria-label="Select all"
                    .checked=${allOn}
                    @change=${() => this.#toggleAll(view)}
                  ></shad-checkbox>
                </shad-table-head>`,
              )}
              ${map(cols, (c) => this.#headCell(c))}
              ${when(hasActions, () => html`<shad-table-head></shad-table-head>`)}
            </shad-table-row>
          </shad-table-header>
          ${when(
            rows.length > 0,
            () => html`<shad-table-body>${map(rows, (row, i) => this.#bodyRow(row, i, cols, hasActions))}</shad-table-body>`,
          )}
        </shad-table>
        ${when(
          rows.length === 0,
          () => html`<div class="flex h-24 items-center justify-center text-sm text-muted-foreground">No results.</div>`,
        )}
      </div>
      ${when(this.selectable || this.pageSize, () => this.#footer(view.length, selCount, page, pageCount))}
    `;
  }

  #toolbar(fc: DataTableColumn | undefined) {
    return html`<div class="flex items-center gap-2 py-4">
      ${when(
        fc,
        () => html`<shad-input
          class="max-w-sm"
          placeholder=${this.filterPlaceholder || `Filter ${fc!.header.toLowerCase()}…`}
          .value=${this.#filter()}
          @input=${(e: Event) => (this.#filter.set((e.target as HTMLInputElement).value), this.#page.set(0))}
        ></shad-input>`,
      )}
      ${when(this.showColumns, () => this.#columnsMenu())}
    </div>`;
  }

  #columnsMenu() {
    const hideable = this.columns.filter((c) => c.hideable !== false);
    return html`<div class="relative ml-auto">
      <shad-button
        variant="outline"
        size="sm"
        aria-expanded=${String(this.#columnsOpen())}
        @click=${(e: Event) => (e.stopPropagation(), this.#columnsOpen.set(!this.#columnsOpen()), this.#actionRow.set(-1))}
        >Columns ${CHEVRON_DOWN}</shad-button
      >
      ${when(
        this.#columnsOpen(),
        () => html`<div class="menu right-0 mt-1" style="right:0">
          ${map(
            hideable,
            (c) => html`<div
              role="menuitemcheckbox"
              aria-checked=${String(!this.#hidden().has(c.key))}
              class="relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm capitalize outline-none hover:bg-accent hover:text-accent-foreground"
              @click=${(e: Event) => (e.stopPropagation(), this.#toggleColumn(c.key))}
            >
              <span class="absolute left-2 flex h-4 w-4 items-center justify-center"
                >${when(!this.#hidden().has(c.key), () => CHECK)}</span
              >
              ${c.header}
            </div>`,
          )}
        </div>`,
      )}
    </div>`;
  }

  #headCell(c: DataTableColumn) {
    if (!c.sortable) {
      return html`<shad-table-head align=${c.align ?? "start"}>${c.header}</shad-table-head>`;
    }
    const active = this.#sortKey() === c.key;
    const icon = !active ? ARROW_UP_DOWN : this.#sortDir() === "asc" ? ARROW_UP : ARROW_DOWN;
    return html`<shad-table-head align=${c.align ?? "start"}>
      <shad-button variant="ghost" size="sm" class="-ml-3" @click=${() => this.#toggleSort(c)}>
        ${c.header}${icon}
      </shad-button>
    </shad-table-head>`;
  }

  #bodyRow(row: Record<string, unknown>, i: number, cols: DataTableColumn[], hasActions: boolean) {
    const id = this.#idOf(row);
    const selected = this.#selected().has(id);
    return html`<shad-table-row .selected=${selected}>
      ${when(
        this.selectable,
        () => html`<shad-table-cell>
          <shad-checkbox aria-label="Select row" .checked=${selected} @change=${() => this.#toggleRow(row)}></shad-checkbox>
        </shad-table-cell>`,
      )}
      ${map(
        cols,
        (c) => html`<shad-table-cell align=${c.align ?? "start"}>
          <div class=${c.class ?? ""}>${c.cell ? c.cell(row) : (row[c.key] as TemplateResult)}</div>
        </shad-table-cell>`,
      )}
      ${when(hasActions, () => this.#actionsCell(row, i))}
    </shad-table-row>`;
  }

  #openActions(e: Event, i: number): void {
    e.stopPropagation();
    if (this.#actionRow() === i) {
      this.#actionRow.set(-1);
      return;
    }
    // Anchor the menu to the trigger in viewport coords; it renders position:
    // fixed so the table's overflow-hidden can't clip it (no portal needed).
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const W = 160; // ~min-width of the menu
    this.#actionX.set(Math.max(8, r.right - W));
    this.#actionY.set(r.bottom + 4);
    this.#columnsOpen.set(false);
    this.#actionRow.set(i);
    requestAnimationFrame(() => {
      const m = this.shadowRoot!.querySelector("[data-row-menu]") as HTMLElement | null;
      if (!m) return;
      const mr = m.getBoundingClientRect();
      if (mr.bottom > innerHeight - 8) this.#actionY.set(r.top - mr.height - 4); // flip up
    });
  }

  #actionsCell(row: Record<string, unknown>, i: number) {
    return html`<shad-table-cell align="end">
      <div class="inline-block text-right">
        <shad-button
          variant="ghost"
          size="icon"
          class="h-8 w-8 p-0"
          aria-haspopup="menu"
          aria-expanded=${String(this.#actionRow() === i)}
          @click=${(e: Event) => this.#openActions(e, i)}
        >
          <span class="sr-only">Open menu</span>${ELLIPSIS}
        </shad-button>
        ${when(
          this.#actionRow() === i,
          () => html`<div class="menu" data-row-menu style=${`position:fixed;left:${this.#actionX()}px;top:${this.#actionY()}px`}>
            ${map(this.rowActions, (a) =>
              a.separator
                ? html`<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>`
                : html`<div
                    role="menuitem"
                    class=${"flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none " +
                    (a.destructive
                      ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                      : "hover:bg-accent hover:text-accent-foreground")}
                    @click=${(e: Event) => (e.stopPropagation(), this.#runAction(a, row))}
                  >
                    ${a.label}
                  </div>`,
            )}
          </div>`,
        )}
      </div>
    </shad-table-cell>`;
  }

  #footer(total: number, selCount: number, page: number, pageCount: number) {
    return html`<div class="flex items-center justify-end gap-2 py-4">
      ${when(
        this.selectable,
        () => html`<div class="flex-1 text-sm text-muted-foreground">${selCount} of ${total} row(s) selected.</div>`,
      )}
      ${when(
        this.pageSize,
        () => html`<div class="flex items-center gap-2">
          <shad-button variant="outline" size="sm" .disabled=${page === 0} @click=${() => this.#page.set(Math.max(0, page - 1))}
            >Previous</shad-button
          >
          <shad-button
            variant="outline"
            size="sm"
            .disabled=${page >= pageCount - 1}
            @click=${() => this.#page.set(Math.min(pageCount - 1, page + 1))}
            >Next</shad-button
          >
        </div>`,
      )}
    </div>`;
  }
}
