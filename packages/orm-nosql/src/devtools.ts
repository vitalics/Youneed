// ── @youneed/orm-nosql/devtools — this package's own devtools UI ──────────────
//
// The document ORM draws its OWN devtools surface — a Mongo-Compass-style studio.
// When the connection's `devtools` data browser is enabled (`Nosql({ devtools })`),
// the panel becomes interactive: a left rail of collections, a paginated/sortable
// document grid, a JSON find-filter console, and inline insert + delete — all
// driven through `ctx.request(...)` against the data-browser routes the ORM
// mounts. When the data browser is OFF, it falls back to the read-only inspector
// (schema + per-op stats + recent ops). Registers with
// `@youneed/server-plugin-devtools`; devtools never special-cases "orm-nosql".

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";
import type { NosqlInspect, NosqlCollectionInfo, NosqlFieldInfo, OpRecord } from "./nosql.ts";

const DOCS = "https://github.com/youneed/framework/tree/main/packages/orm-nosql";
const PAGE_SIZES = [25, 50, 100, 200];

const fmtMs = (ms: number): string => (ms < 1 ? `${(ms * 1000) | 0}µs` : `${ms.toFixed(1)}ms`);
const avg = (s: { count: number; totalMs: number }): number => (s.count ? s.totalMs / s.count : 0);
const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

interface DataCollection {
  name: string;
  readonly: boolean;
  fields: NosqlFieldInfo[];
}
interface DocsPayload {
  collection: string;
  fields: NosqlFieldInfo[];
  docs: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  ms: number;
  error?: string;
}

// ── the panel ─────────────────────────────────────────────────────────────────
@Component.define()
export class NosqlPanel extends Component("server-nosql-panel") {
  static styles = css`
    :host { display: block; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .err { color: hsl(var(--destructive)); }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    h3 { margin: 1rem 0 0.25rem; font-size: 0.95rem; }

    .studio { display: grid; grid-template-columns: 14rem 1fr; min-height: 26rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); overflow: hidden; }
    .rail { border-right: 1px solid hsl(var(--border)); display: flex; flex-direction: column; min-width: 0; }
    .rail-head { padding: 0.6rem 0.75rem; border-bottom: 1px solid hsl(var(--border)); font-size: 0.8rem; }
    .colls { overflow-y: auto; padding: 0.25rem; flex: 1; }
    .coll { display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left; padding: 0.4rem 0.5rem; border: 0; background: transparent; border-radius: calc(var(--radius) - 2px); cursor: pointer; font-size: 0.85rem; color: hsl(var(--foreground)); }
    .coll:hover { background: hsl(var(--accent)); }
    .coll.active { background: hsl(var(--accent)); font-weight: 600; }

    .main { display: flex; flex-direction: column; min-width: 0; }
    .toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid hsl(var(--border)); flex-wrap: wrap; }
    .toolbar .spacer { flex: 1; }
    .toolbar select, .toolbar input { font: inherit; font-size: 0.8rem; padding: 0.2rem 0.4rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px); background: hsl(var(--background)); color: inherit; }
    .filter { flex: 1; min-width: 12rem; }
    .iconbtn { border: 1px solid hsl(var(--border)); background: hsl(var(--background)); border-radius: calc(var(--radius) - 2px); cursor: pointer; padding: 0.2rem 0.5rem; font: inherit; font-size: 0.8rem; color: inherit; }
    .iconbtn:hover:not(:disabled) { background: hsl(var(--accent)); }
    .iconbtn:disabled { opacity: 0.4; cursor: default; }

    .gridwrap { overflow: auto; flex: 1; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    table.grid th, table.grid td { text-align: left; padding: 5px 10px; border-bottom: 1px solid hsl(var(--border)); white-space: nowrap; vertical-align: top; }
    table.grid thead th { position: sticky; top: 0; background: hsl(var(--background)); z-index: 1; cursor: pointer; user-select: none; }
    table.grid thead th:hover { background: hsl(var(--accent)); }
    table.grid th .ty { color: hsl(var(--muted-foreground)); font-weight: 400; font-size: 0.72rem; margin-left: 0.35rem; }
    td.val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; max-width: 24rem; overflow: hidden; text-overflow: ellipsis; }
    .rowact { width: 1%; }
    .delbtn { border: 0; background: transparent; cursor: pointer; color: hsl(var(--muted-foreground)); padding: 0 0.3rem; font-size: 0.9rem; }
    .delbtn:hover { color: hsl(var(--destructive)); }
    .empty { padding: 2.5rem 1rem; text-align: center; color: hsl(var(--muted-foreground)); }
    .insert { padding: 0.6rem 0.75rem; border-top: 1px solid hsl(var(--border)); display: flex; flex-direction: column; gap: 0.4rem; }
    .insert textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; min-height: 4rem; padding: 0.4rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--background)); color: inherit; resize: vertical; }

    .ro-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); }
    table.ro { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    table.ro th, table.ro td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); vertical-align: top; }
    table.ro th { color: hsl(var(--muted-foreground)); font-weight: 600; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: NosqlInspect; ctx: DevtoolsContext } | null = null;

  #colls = this.signal<DataCollection[]>([]);
  #selected = this.signal<string | null>(null);
  #page = this.signal<DocsPayload | null>(null);
  #limit = this.signal(50);
  #offset = this.signal(0);
  #orderBy = this.signal<string | null>(null);
  #dir = this.signal<"asc" | "desc">("asc");
  #filter = this.signal("");
  #insert = this.signal("");
  #error = this.signal<string | null>(null);
  #loading = this.signal(false);
  #ready = false;

  get #ep() {
    return this.data?.info.endpoints;
  }
  #req(path: string, init?: RequestInit): Promise<Response> {
    return this.data!.ctx.request(path, init);
  }

  #ensureLoaded(): void {
    if (this.#ready || !this.#ep) return;
    this.#ready = true;
    void this.#loadCollections();
  }

  async #loadCollections(): Promise<void> {
    try {
      const res = await this.#req(this.#ep!.collections);
      const json = (await res.json()) as { collections?: DataCollection[] };
      this.#colls.set(json.collections ?? []);
      const first = json.collections?.[0];
      if (first) await this.#select(first.name);
    } catch (e) {
      this.#error.set(errStr(e));
    }
  }

  async #select(name: string): Promise<void> {
    this.#selected.set(name);
    this.#offset.set(0);
    this.#orderBy.set(null);
    await this.#load();
  }

  async #load(): Promise<void> {
    const coll = this.#selected();
    if (!coll || !this.#ep) return;
    this.#loading.set(true);
    this.#error.set(null);
    try {
      const p = new URLSearchParams({ collection: coll, limit: String(this.#limit()), offset: String(this.#offset()) });
      if (this.#orderBy()) p.set("orderBy", this.#orderBy()!), p.set("dir", this.#dir());
      if (this.#filter().trim()) p.set("filter", this.#filter().trim());
      const res = await this.#req(`${this.#ep.docs}?${p}`);
      const json = (await res.json()) as DocsPayload;
      if (json.error) this.#error.set(json.error);
      this.#page.set(json.error ? null : json);
    } catch (e) {
      this.#error.set(errStr(e));
    } finally {
      this.#loading.set(false);
    }
  }

  #sortBy(field: string): void {
    if (this.#orderBy() === field) this.#dir.set(this.#dir() === "asc" ? "desc" : "asc");
    else (this.#orderBy.set(field), this.#dir.set("asc"));
    void this.#load();
  }

  #idField(): string {
    const c = this.#colls().find((c) => c.name === this.#selected());
    return c?.fields.find((f) => f.primary)?.name ?? "_id";
  }

  async #post(endpoint: string | undefined, body: unknown): Promise<void> {
    if (!endpoint) return;
    this.#error.set(null);
    try {
      const res = await this.#req(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { error?: string };
      if (json.error) this.#error.set(json.error);
      else await this.#load();
    } catch (e) {
      this.#error.set(errStr(e));
    }
  }

  #doInsert(): void {
    let doc: unknown;
    try {
      doc = JSON.parse(this.#insert() || "{}");
    } catch {
      this.#error.set("insert: invalid JSON");
      return;
    }
    this.#insert.set("");
    void this.#post(this.#ep?.insert, { collection: this.#selected(), doc });
  }

  #doDelete(id: unknown): void {
    void this.#post(this.#ep?.delete, { collection: this.#selected(), filter: { [this.#idField()]: id } });
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    // No data browser → read-only inspector.
    if (!info.endpoints) return this.#readonly(info);
    this.#ensureLoaded();
    return this.#studio(info);
  }

  #studio(info: NosqlInspect): View {
    const colls = this.#colls();
    const page = this.#page();
    const sel = this.#selected();
    const ro = info.readonly || colls.find((c) => c.name === sel)?.readonly;
    const fields = page?.fields ?? [];
    return html`
      <div class="row"><span class="name">${info.store}</span>${info.database ? html` <span class="muted">${info.database}</span>` : html``} ${ro ? html`<shad-badge variant="outline">read-only</shad-badge>` : html``}</div>
      ${this.#error() ? html`<div class="row err mono">${this.#error()}</div>` : html``}
      <div class="studio">
        <div class="rail">
          <div class="rail-head muted">collections (${colls.length})</div>
          <div class="colls">
            ${repeat(colls, (c) => c.name, (c) => html`<button class=${c.name === sel ? "coll active" : "coll"} @click=${() => this.#select(c.name)}>▤ ${c.name}</button>`)}
          </div>
        </div>
        <div class="main">
          <div class="toolbar">
            <input class="filter mono" placeholder='find filter, e.g. {"age":{"$gt":18}}' .value=${this.#filter()} @input=${(e: Event) => this.#filter.set((e.target as HTMLInputElement).value)} @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.#load()} />
            <button class="iconbtn" @click=${() => this.#load()}>run</button>
            <span class="spacer"></span>
            <span class="muted">${page ? `${page.total} docs · ${fmtMs(page.ms)}` : ""}</span>
            <select @change=${(e: Event) => (this.#limit.set(Number((e.target as HTMLSelectElement).value)), this.#load())}>
              ${PAGE_SIZES.map((n) => html`<option value=${n} ?selected=${n === this.#limit()}>${n}/page</option>`)}
            </select>
            <button class="iconbtn" ?disabled=${this.#offset() === 0} @click=${() => (this.#offset.set(Math.max(0, this.#offset() - this.#limit())), this.#load())}>‹</button>
            <button class="iconbtn" ?disabled=${!page || this.#offset() + this.#limit() >= page.total} @click=${() => (this.#offset.set(this.#offset() + this.#limit()), this.#load())}>›</button>
            <button class="iconbtn" @click=${() => this.#load()}>↻</button>
          </div>
          <div class="gridwrap">
            ${!page || !page.docs.length
              ? html`<div class="empty">${this.#loading() ? "loading…" : "no documents"}</div>`
              : html`<table class="grid">
                  <thead><tr>
                    ${columnsOf(page).map((f) => html`<th @click=${() => this.#sortBy(f)}>${f}${this.#orderBy() === f ? html`<span> ${this.#dir() === "asc" ? "▲" : "▼"}</span>` : html``}<span class="ty">${typeOf(fields, f)}</span></th>`)}
                    ${ro ? html`` : html`<th class="rowact"></th>`}
                  </tr></thead>
                  <tbody>
                    ${repeat(
                      page.docs,
                      (d, i) => String(d[this.#idField()] ?? i),
                      (d) => html`<tr>
                        ${columnsOf(page).map((f) => html`<td class="val">${cell(d[f])}</td>`)}
                        ${ro ? html`` : html`<td class="rowact"><button class="delbtn" title="delete" @click=${() => this.#doDelete(d[this.#idField()])}>✕</button></td>`}
                      </tr>`,
                    )}
                  </tbody>
                </table>`}
          </div>
          ${ro
            ? html``
            : html`<div class="insert">
                <span class="muted">insert document (JSON)</span>
                <textarea placeholder='{"name":"Ada"}' .value=${this.#insert()} @input=${(e: Event) => this.#insert.set((e.target as HTMLTextAreaElement).value)}></textarea>
                <div class="row"><button class="iconbtn" @click=${() => this.#doInsert()}>insert</button></div>
              </div>`}
        </div>
      </div>
    `;
  }

  #readonly(info: NosqlInspect): View {
    const stats = Object.entries(info.stats);
    return html`
      <div class="row"><span class="name">${info.store}</span>${info.database ? html` <span class="muted">${info.database}</span>` : html``} <span class="muted">data browser off — read-only inspector</span></div>
      <h3>collections</h3>
      <div class="ro-grid">
        ${info.collections.map(
          (c) => html`<shad-card style="display:block;padding:0.75rem">
            <div class="row"><span class="name">${c.name}</span> ${c.readonly ? html`<shad-badge variant="outline">read-only</shad-badge>` : html``}</div>
            <table class="ro"><tr><th>field</th><th>type</th></tr>
              ${c.fields.map((f) => html`<tr><td>${f.name}${f.primary ? " ●" : ""}</td><td class="muted">${f.type}${f.unique ? " · unique" : ""}</td></tr>`)}
            </table>
          </shad-card>`,
        )}
      </div>
      ${stats.length
        ? html`<h3>ops</h3>
            <table class="ro"><tr><th>op</th><th>count</th><th>avg</th><th>errors</th></tr>
              ${stats.map(([op, s]) => html`<tr><td class="mono">${op}</td><td>${s.count}</td><td>${fmtMs(avg(s))}</td><td>${s.errors}</td></tr>`)}
            </table>`
        : html``}
    `;
  }
}

function columnsOf(page: DocsPayload): string[] {
  const seen = new Set<string>();
  for (const f of page.fields) seen.add(f.name);
  for (const d of page.docs) for (const k in d) seen.add(k);
  return [...seen];
}
function typeOf(fields: NosqlFieldInfo[], name: string): string {
  return fields.find((f) => f.name === name)?.type ?? "";
}
function errStr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

registerDevtoolsRenderer({
  kind: "orm-nosql",
  label: "NoSQL",
  docs: DOCS,
  card(info, ctx): View {
    const n = info as NosqlInspect;
    const ops = Object.values(n.stats).reduce((a, s) => a + s.count, 0);
    return html`
      <div class="row"><shad-badge variant="secondary">${n.store}</shad-badge> <span class="muted">${n.collections.length} collections · ${ops} ops${n.endpoints ? " · live studio" : ""}</span></div>
      <div class="row"><a class="link" href="#/plugin/orm-nosql" @click=${() => ctx.goto("#/plugin/orm-nosql")}>open NoSQL →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-nosql-panel .data=${{ info, ctx }}></server-nosql-panel>`;
  },
  flowNode(info) {
    const n = info as NosqlInspect;
    return { label: `NoSQL\n${n.store}`, detail: { store: n.store, database: n.database, collections: n.collections } };
  },
  drawer(detail, ctx): View {
    const d = detail as { store?: string; database?: string; collections?: NosqlCollectionInfo[] };
    const colls = d.collections ?? [];
    return html`
      <span slot="title">NoSQL</span>
      <span slot="description">${d.store ?? "—"}${d.database ? ` · ${d.database}` : ""}</span>
      <div style="padding:1rem">
        <div class="muted">${colls.length} collection(s)</div>
        ${colls.map((c) => html`<div class="row"><span class="name">${c.name}</span> <span class="muted">${c.fields.length} fields</span></div>`)}
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/orm-nosql")}>Open NoSQL →</shad-button>
    `;
  },
});
