// ── @youneed/orm-sql/devtools — this package's own devtools UI ────────────────
//
// The ORM draws its OWN devtools surfaces — an Encore-style "Database" studio.
// When the connection's `devtools` data browser is enabled (`Orm({ devtools })`),
// the panel becomes interactive: a left rail of tables, a paginated/searchable/
// sortable data grid, inline add-record + delete-row, and a SQL console — all
// driven through `ctx.request(...)` against the data-browser routes the ORM
// mounts. When the data browser is OFF, it falls back to the read-only inspector
// (schema + per-op stats + recent queries). It registers with
// `@youneed/server-plugin-devtools`; devtools never special-cases "orm-sql".

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";
import type { OrmInspect, OrmTableInfo, OrmColumnInfo, QueryRecord } from "./orm.ts";

const DOCS = "https://github.com/youneed/framework/tree/main/packages/orm-sql";
const PAGE_SIZES = [25, 50, 100, 200];

const fmtMs = (ms: number): string => (ms < 1 ? `${(ms * 1000) | 0}µs` : `${ms.toFixed(1)}ms`);
const avg = (s: { count: number; totalMs: number }): number => (s.count ? s.totalMs / s.count : 0);

// Loaded table descriptor (from the live `/tables` endpoint).
interface DataTable {
  name: string;
  readonly: boolean;
  columns: OrmColumnInfo[];
}
interface BrowsePayload {
  table: string;
  columns: OrmColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  ms: number;
  error?: string;
}
interface SqlPayload {
  kind?: "select" | "mutation";
  columns?: string[];
  rows?: Record<string, unknown>[];
  total?: number;
  rowsAffected?: number;
  lastInsertId?: number | null;
  ms?: number;
  error?: string;
}

// ── the panel ─────────────────────────────────────────────────────────────────
@Component.define()
export class OrmPanel extends Component("server-orm-panel") {
  static styles = css`
    :host { display: block; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .err { color: hsl(var(--destructive)); }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    h3 { margin: 1rem 0 0.25rem; font-size: 0.95rem; }

    /* ── studio (interactive) layout — left rail + main pane ── */
    .studio { display: grid; grid-template-columns: 15rem 1fr; min-height: 30rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); overflow: hidden; }
    .rail { border-right: 1px solid hsl(var(--border)); display: flex; flex-direction: column; min-width: 0; }
    .rail-head { padding: 0.75rem; border-bottom: 1px solid hsl(var(--border)); }
    .rail-actions { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; border-bottom: 1px solid hsl(var(--border)); }
    .tables { overflow-y: auto; padding: 0.25rem; flex: 1; }
    .tbl { display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left; padding: 0.4rem 0.5rem; border: 0; background: transparent; border-radius: calc(var(--radius) - 2px); cursor: pointer; font-size: 0.85rem; color: hsl(var(--foreground)); }
    .tbl:hover { background: hsl(var(--accent)); }
    .tbl.active { background: hsl(var(--accent)); font-weight: 600; }
    .tbl-ico { opacity: 0.6; flex: none; }
    .tbl-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .main { display: flex; flex-direction: column; min-width: 0; }
    .toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid hsl(var(--border)); flex-wrap: wrap; }
    .toolbar .spacer { flex: 1; }
    .toolbar select { font: inherit; font-size: 0.8rem; padding: 0.2rem 0.4rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px); background: hsl(var(--background)); color: inherit; }
    .iconbtn { border: 1px solid hsl(var(--border)); background: hsl(var(--background)); border-radius: calc(var(--radius) - 2px); cursor: pointer; padding: 0.2rem 0.5rem; font: inherit; font-size: 0.8rem; color: inherit; }
    .iconbtn:hover:not(:disabled) { background: hsl(var(--accent)); }
    .iconbtn:disabled { opacity: 0.4; cursor: default; }

    .gridwrap { overflow: auto; flex: 1; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
    table.grid th, table.grid td { text-align: left; padding: 5px 10px; border-bottom: 1px solid hsl(var(--border)); white-space: nowrap; vertical-align: top; }
    table.grid thead th { position: sticky; top: 0; background: hsl(var(--background)); z-index: 1; cursor: pointer; user-select: none; }
    table.grid thead th:hover { background: hsl(var(--accent)); }
    table.grid th .ty { color: hsl(var(--muted-foreground)); font-weight: 400; font-size: 0.72rem; margin-left: 0.35rem; }
    table.grid tbody tr:hover { background: hsl(var(--muted) / 0.4); }
    td.val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; max-width: 22rem; overflow: hidden; text-overflow: ellipsis; }
    td.null { color: hsl(var(--muted-foreground)); font-style: italic; }
    .rowact { width: 1%; }
    .delbtn { border: 0; background: transparent; cursor: pointer; color: hsl(var(--muted-foreground)); padding: 0 0.3rem; font-size: 0.9rem; }
    .delbtn:hover { color: hsl(var(--destructive)); }
    .sortarrow { font-size: 0.7rem; }

    .empty { padding: 3rem 1rem; text-align: center; color: hsl(var(--muted-foreground)); }
    .addrow input { font: inherit; font-size: 0.8rem; width: 100%; box-sizing: border-box; padding: 0.2rem 0.4rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px); background: hsl(var(--background)); color: inherit; }

    .console { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .console textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.83rem; min-height: 7rem; padding: 0.5rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--background)); color: inherit; resize: vertical; }

    /* ── read-only fallback ── */
    .ro-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); }
    .flags { display: flex; gap: 0.25rem; flex-wrap: wrap; }
    table.ro { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    table.ro th, table.ro td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); vertical-align: top; }
    table.ro th { color: hsl(var(--muted-foreground)); font-weight: 600; }
    .sql { max-width: 28rem; white-space: pre-wrap; word-break: break-word; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: OrmInspect; ctx: DevtoolsContext } | null = null;

  // studio state
  #tables = this.signal<DataTable[]>([]);
  #selected = this.signal<string | null>(null);
  #mode = this.signal<"browse" | "sql">("browse");
  #loading = this.signal(false);
  #error = this.signal<string | null>(null);

  // browse state
  #page = this.signal<BrowsePayload | null>(null);
  #limit = this.signal(50);
  #offset = this.signal(0);
  #orderBy = this.signal<string | null>(null);
  #dir = this.signal<"asc" | "desc">("asc");
  #search = this.signal("");
  #adding = this.signal(false);
  // Plain object (NOT a signal) — mutated on each keystroke without a re-render,
  // so the uncontrolled <input> keeps focus + caret while typing. Read at save.
  #draft: Record<string, string> = {};

  // console state
  #sqlText = this.signal("SELECT 1;");
  #sqlResult = this.signal<SqlPayload | null>(null);

  get #endpoints() {
    return this.data?.info.endpoints;
  }
  get #readonly(): boolean {
    return !!this.data?.info.readonly;
  }

  onMount(): void {
    if (this.#endpoints) void this.#loadTables();
  }

  // ── request helpers ───────────────────────────────────────────────────────
  async #get(path: string): Promise<any> {
    const res = await this.data!.ctx.request(path);
    return res.json();
  }
  async #post(path: string, body: unknown): Promise<any> {
    const res = await this.data!.ctx.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async #loadTables(): Promise<void> {
    const ep = this.#endpoints;
    if (!ep) return;
    try {
      const out = await this.#get(ep.tables);
      const tables: DataTable[] = out.tables ?? [];
      this.#tables.set(tables);
      if (!this.#selected() && tables.length) this.#select(tables[0].name);
    } catch (e) {
      this.#error.set(String(e));
    }
  }

  #select(name: string): void {
    this.#selected.set(name);
    this.#mode.set("browse");
    this.#offset.set(0);
    this.#orderBy.set(null);
    this.#search.set("");
    this.#adding.set(false);
    void this.#loadRows();
  }

  async #loadRows(): Promise<void> {
    const ep = this.#endpoints;
    const table = this.#selected();
    if (!ep || !table) return;
    this.#loading.set(true);
    this.#error.set(null);
    const qs = new URLSearchParams({ table, limit: String(this.#limit()), offset: String(this.#offset()) });
    const ob = this.#orderBy();
    if (ob) {
      qs.set("orderBy", ob);
      qs.set("dir", this.#dir());
    }
    if (this.#search()) qs.set("q", this.#search());
    try {
      const out: BrowsePayload = await this.#get(`${ep.rows}?${qs}`);
      if (out.error) this.#error.set(out.error);
      else this.#page.set(out);
    } catch (e) {
      this.#error.set(String(e));
    } finally {
      this.#loading.set(false);
    }
  }

  #sort(col: string): void {
    if (this.#orderBy() === col) this.#dir.set(this.#dir() === "asc" ? "desc" : "asc");
    else {
      this.#orderBy.set(col);
      this.#dir.set("asc");
    }
    this.#offset.set(0);
    void this.#loadRows();
  }

  #setLimit(n: number): void {
    this.#limit.set(n);
    this.#offset.set(0);
    void this.#loadRows();
  }

  #pageBy(delta: number): void {
    const p = this.#page();
    if (!p) return;
    const next = Math.max(0, this.#offset() + delta * this.#limit());
    if (next >= p.total && delta > 0) return;
    this.#offset.set(next);
    void this.#loadRows();
  }

  #applySearch(v: string): void {
    this.#search.set(v);
    this.#offset.set(0);
    void this.#loadRows();
  }

  #tableCols(): OrmColumnInfo[] {
    return this.#tables().find((t) => t.name === this.#selected())?.columns ?? this.#page()?.columns ?? [];
  }

  async #addRecord(): Promise<void> {
    const ep = this.#endpoints;
    const table = this.#selected();
    if (!ep?.insert || !table) return;
    const draft = this.#draft;
    const values: Record<string, unknown> = {};
    for (const c of this.#tableCols()) {
      if (c.generated) continue;
      const raw = draft[c.name];
      if (raw === undefined || raw === "") continue;
      values[c.name] = coerce(raw, c.type);
    }
    const out = await this.#post(ep.insert, { table, values });
    if (out.error) {
      this.#error.set(out.error);
      return;
    }
    this.#draft = {};
    this.#adding.set(false);
    void this.#loadRows();
  }

  async #deleteRow(row: Record<string, unknown>): Promise<void> {
    const ep = this.#endpoints;
    const table = this.#selected();
    const pk = this.#tableCols().find((c) => c.primary);
    if (!ep?.delete || !table || !pk) return;
    const out = await this.#post(ep.delete, { table, where: { [pk.name]: row[pk.name] } });
    if (out.error) this.#error.set(out.error);
    else void this.#loadRows();
  }

  async #runSql(): Promise<void> {
    const ep = this.#endpoints;
    if (!ep) return;
    this.#loading.set(true);
    try {
      const out: SqlPayload = await this.#post(ep.query, { sql: this.#sqlText() });
      this.#sqlResult.set(out);
    } catch (e) {
      this.#sqlResult.set({ error: String(e) });
    } finally {
      this.#loading.set(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  override render(): View {
    const info = this.data?.info;
    if (!info) return html``;
    if (!info.endpoints) return this.#legacy(info); // data browser off → read-only inspector
    return html`<div class="studio">${this.#rail(info)}${this.#mainPane()}</div>`;
  }

  #rail(info: OrmInspect): View {
    const sel = this.#selected();
    return html`
      <div class="rail">
        <div class="rail-head">
          <div class="name">${info.database || "database"}</div>
          <div class="muted mono">${info.type}${this.#readonly ? " · read-only" : ""}</div>
        </div>
        <div class="rail-actions">
          <shad-button variant=${this.#mode() === "browse" ? "secondary" : "ghost"} @click=${() => this.#mode.set("browse")}>Browse data</shad-button>
          <shad-button variant=${this.#mode() === "sql" ? "secondary" : "ghost"} @click=${() => this.#mode.set("sql")}>SQL console</shad-button>
        </div>
        <div class="tables">
          ${repeat(this.#tables(), (t) => t.name, (t) => html`
            <button class="tbl ${t.name === sel ? "active" : ""}" @click=${() => this.#select(t.name)}>
              <span class="tbl-ico">▦</span>
              <span class="tbl-name">${t.name}</span>
              ${t.readonly ? html`<shad-badge variant="outline">ro</shad-badge>` : html``}
            </button>`)}
          ${this.#tables().length ? html`` : html`<div class="muted" style="padding:0.5rem">No tables.</div>`}
        </div>
      </div>`;
  }

  #mainPane(): View {
    if (this.#mode() === "sql") return this.#sqlConsole();
    return this.#browser();
  }

  #browser(): View {
    const p = this.#page();
    const cols = this.#tableCols();
    const err = this.#error();
    const pk = cols.find((c) => c.primary);
    const canWrite = !this.#readonly && !!this.#endpoints?.insert;
    const from = p ? (p.total ? p.offset + 1 : 0) : 0;
    const to = p ? Math.min(p.offset + p.limit, p.total) : 0;
    return html`
      <div class="main">
        <div class="toolbar">
          <span class="name mono">${this.#selected() ?? "—"}</span>
          ${canWrite
            ? html`<shad-button variant="outline" @click=${() => this.#toggleAdd()}>${this.#adding() ? "Cancel" : "+ Add record"}</shad-button>`
            : html``}
          <span class="spacer"></span>
          <shad-input
            placeholder="search rows…"
            .value=${this.#search()}
            @input=${(e: Event) => this.#applySearch((e.target as HTMLInputElement).value)}
            style="max-width:14rem"
          ></shad-input>
          <span class="muted">${p ? `${p.total} rows · ${fmtMs(p.ms)}` : this.#loading() ? "loading…" : ""}</span>
          <select @change=${(e: Event) => this.#setLimit(Number((e.target as HTMLSelectElement).value))}>
            ${PAGE_SIZES.map((n) => html`<option value=${n} ?selected=${n === this.#limit()}>${n}</option>`)}
          </select>
          <button class="iconbtn" ?disabled=${!p || p.offset === 0} @click=${() => this.#pageBy(-1)}>‹ prev</button>
          <span class="muted mono">${from}–${to}</span>
          <button class="iconbtn" ?disabled=${!p || to >= p.total} @click=${() => this.#pageBy(1)}>next ›</button>
          <button class="iconbtn" @click=${() => this.#loadRows()}>↻</button>
        </div>

        ${err ? html`<shad-alert variant="destructive" style="margin:0.5rem 0.75rem"><span slot="title">Query failed</span>${err}</shad-alert>` : html``}

        <div class="gridwrap">
          <table class="grid">
            <thead>
              <tr>
                ${cols.map((c) => html`
                  <th @click=${() => this.#sort(c.name)}>
                    ${c.name}${c.primary ? html` <shad-badge>PK</shad-badge>` : html``}
                    <span class="ty mono">${c.type}</span>
                    ${this.#orderBy() === c.name ? html`<span class="sortarrow"> ${this.#dir() === "asc" ? "▲" : "▼"}</span>` : html``}
                  </th>`)}
                ${canWrite && pk ? html`<th class="rowact"></th>` : html``}
              </tr>
            </thead>
            <tbody>
              ${this.#adding() && canWrite ? this.#addRow(cols, !!pk) : html``}
              ${p
                ? repeat(p.rows, (_r, i) => i, (r) => html`
                  <tr>
                    ${cols.map((c) => this.#cell(r[c.name]))}
                    ${canWrite && pk ? html`<td class="rowact"><button class="delbtn" title="Delete row" @click=${() => this.#deleteRow(r)}>✕</button></td>` : html``}
                  </tr>`)
                : html``}
            </tbody>
          </table>
          ${p && !p.rows.length && !this.#adding() ? html`<div class="empty">No rows · limit ${p.limit} offset ${p.offset}</div>` : html``}
        </div>
      </div>`;
  }

  #cell(value: unknown): View {
    if (value === null || value === undefined) return html`<td class="val null">NULL</td>`;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return html`<td class="val" title=${text}>${text}</td>`;
  }

  #toggleAdd(): void {
    this.#draft = {};
    this.#adding.set(!this.#adding());
  }

  #addRow(cols: OrmColumnInfo[], hasPk: boolean): View {
    // Uncontrolled inputs (no `.value` binding) — typing mutates `#draft` without
    // a re-render, so focus + caret survive. `#draft` was cleared on open.
    return html`
      <tr class="addrow">
        ${cols.map((c) => html`<td>
          ${c.generated
            ? html`<span class="muted">auto</span>`
            : html`<input
                placeholder=${c.nullable ? "null" : c.type}
                @input=${(e: Event) => (this.#draft[c.name] = (e.target as HTMLInputElement).value)}
              />`}
        </td>`)}
        ${hasPk ? html`<td class="rowact"><button class="delbtn" title="Save" style="color:hsl(var(--primary))" @click=${() => this.#addRecord()}>✓</button></td>` : html``}
      </tr>`;
  }

  #sqlConsole(): View {
    const r = this.#sqlResult();
    return html`
      <div class="main">
        <div class="console">
          <textarea
            spellcheck="false"
            .value=${this.#sqlText()}
            @input=${(e: Event) => this.#sqlText.set((e.target as HTMLTextAreaElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void this.#runSql();
            }}
          ></textarea>
          <div class="row">
            <shad-button @click=${() => this.#runSql()} ?disabled=${this.#loading()}>Run ⌘↵</shad-button>
            ${this.#readonly ? html`<span class="muted">read-only · SELECT / PRAGMA / EXPLAIN only</span>` : html``}
          </div>
          ${r ? this.#sqlOut(r) : html`<div class="muted">Run a statement to see results.</div>`}
        </div>
      </div>`;
  }

  #sqlOut(r: SqlPayload): View {
    if (r.error) return html`<shad-alert variant="destructive"><span slot="title">Error</span>${r.error}</shad-alert>`;
    if (r.kind === "mutation")
      return html`<shad-alert><span slot="title">OK · ${fmtMs(r.ms ?? 0)}</span>${r.rowsAffected ?? 0} row(s) affected${r.lastInsertId != null ? ` · last id ${r.lastInsertId}` : ""}</shad-alert>`;
    const cols = r.columns ?? [];
    const rows = r.rows ?? [];
    return html`
      <div class="muted">${rows.length}${(r.total ?? 0) > rows.length ? ` of ${r.total}` : ""} row(s) · ${fmtMs(r.ms ?? 0)}</div>
      <div class="gridwrap" style="max-height:24rem">
        <table class="grid">
          <thead><tr>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead>
          <tbody>
            ${repeat(rows, (_r, i) => i, (row) => html`<tr>${cols.map((c) => this.#cell(row[c]))}</tr>`)}
          </tbody>
        </table>
        ${rows.length ? html`` : html`<div class="empty">No rows.</div>`}
      </div>`;
  }

  // ── read-only fallback (data browser off) ────────────────────────────────────
  #legacy(info: OrmInspect): View {
    const stats = Object.entries(info.stats);
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">database</span>
            <shad-badge variant="secondary">${info.type}</shad-badge>
            ${info.database ? html`<span class="muted mono">${info.database}</span>` : html``}
            <span class="muted">· ${info.tables.length} table(s)</span>
            <span class="muted">· enable <span class="mono">Orm({ devtools: true })</span> for the live DB studio</span>
          </div>

          ${stats.length
            ? html`
              <h3>queries by op</h3>
              <table class="ro">
                <thead><tr><th>op</th><th>count</th><th>avg</th><th>total</th><th>errors</th></tr></thead>
                <tbody>
                  ${stats.map(([op, s]) => html`<tr>
                    <td class="mono">${op}</td><td>${s.count}</td><td>${fmtMs(avg(s))}</td>
                    <td>${fmtMs(s.totalMs)}</td><td class=${s.errors ? "err" : ""}>${s.errors}</td>
                  </tr>`)}
                </tbody>
              </table>`
            : html``}

          <h3>tables</h3>
          <div class="ro-grid">${info.tables.map((t) => this.#tableCard(t))}</div>

          <h3>recent queries (${info.recent.length})</h3>
          ${info.recent.length
            ? html`
              <table class="ro">
                <thead><tr><th>op</th><th>ms</th><th>rows</th><th>sql</th></tr></thead>
                <tbody>
                  ${repeat(info.recent, (_q, i) => i, (q: QueryRecord) => html`
                    <tr>
                      <td class="mono">${q.op}</td>
                      <td>${fmtMs(q.ms)}</td>
                      <td>${q.rows ?? "—"}</td>
                      <td class="sql mono ${q.error ? "err" : ""}">${q.error ? `${q.sql}\n⚠ ${q.error}` : q.sql}</td>
                    </tr>`)}
                </tbody>
              </table>`
            : html`<div class="muted">No queries recorded yet.</div>`}
        </div>
      </shad-card>`;
  }

  #tableCard(t: OrmTableInfo): View {
    return html`
      <shad-card>
        <div style="padding:0.75rem">
          <div class="row">
            <span class="name">${t.name}</span>
            ${t.readonly ? html`<shad-badge variant="secondary">readonly</shad-badge>` : html``}
            ${t.synchronize ? html`` : html`<shad-badge variant="outline">no-sync</shad-badge>`}
          </div>
          <table class="ro">
            <thead><tr><th>column</th><th>type</th><th>flags</th></tr></thead>
            <tbody>
              ${repeat(t.columns, (c) => `${t.name}.${c.name}`, (c) => html`
                <tr>
                  <td class="mono">${c.name}</td>
                  <td class="muted">${c.type}</td>
                  <td><span class="flags">
                    ${c.primary ? html`<shad-badge>PK</shad-badge>` : html``}
                    ${c.generated ? html`<shad-badge variant="secondary">auto</shad-badge>` : html``}
                    ${c.unique ? html`<shad-badge variant="outline">unique</shad-badge>` : html``}
                    ${c.nullable ? html`<span class="muted">null</span>` : html``}
                  </span></td>
                </tr>`)}
            </tbody>
          </table>
          ${t.relations.length
            ? html`<div class="muted" style="margin-top:0.4rem">relations: ${t.relations.map((r) => `${r.property} → ${r.target ?? "?"} (${r.kind})`).join(", ")}</div>`
            : html``}
          ${t.indexes.length
            ? html`<div class="muted">indexes: ${t.indexes.map((i) => i.property + (i.unique ? " (unique)" : "")).join(", ")}</div>`
            : html``}
        </div>
      </shad-card>`;
  }
}

// Coerce an add-record text input to the column's logical type for the JSON body.
function coerce(raw: string, type: OrmColumnInfo["type"]): unknown {
  if (type === "boolean") return raw === "true" || raw === "1";
  if (type === "int" || type === "float" || type === "number") return Number(raw);
  if (type === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

registerDevtoolsRenderer({
  kind: "orm-sql",
  label: "Database",
  docs: DOCS,
  card(info, ctx): View {
    const o = info as OrmInspect;
    const total = Object.values(o.stats).reduce((n, s) => n + s.count, 0);
    return html`
      <div class="row"><shad-badge variant="secondary">${o.type}</shad-badge> <span class="muted">${o.tables.length} tables · ${total} queries${o.endpoints ? " · live studio" : ""}</span></div>
      <div class="row"><a class="link" href="#/plugin/orm-sql" @click=${() => ctx.goto("#/plugin/orm-sql")}>open Database →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-orm-panel .data=${{ info, ctx }}></server-orm-panel>`;
  },
  flowNode(info) {
    const o = info as OrmInspect;
    return { label: `Database\n${o.type}`, detail: { type: o.type, database: o.database, tables: o.tables } };
  },
  drawer(detail, ctx): View {
    const d = detail as { type?: string; database?: string; tables?: OrmTableInfo[] };
    const tables = d.tables ?? [];
    return html`
      <span slot="title">Database</span>
      <span slot="description">${d.type ?? "—"}${d.database ? ` · ${d.database}` : ""}</span>
      <div style="padding:1rem">
        <div class="muted">${tables.length} table(s)</div>
        ${tables.map((t) => html`<div class="row"><span class="name">${t.name}</span> <span class="muted">${t.columns.length} cols${t.readonly ? " · readonly" : ""}</span></div>`)}
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/orm-sql")}>Open Database →</shad-button>
    `;
  },
});
