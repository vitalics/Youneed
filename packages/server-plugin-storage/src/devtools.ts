// ── @youneed/server-plugin-storage/devtools — this package's own devtools UI ──
//
// Draws the Storage devtools surfaces (Infra card, header-tab panel with a live
// object browser + put/download/delete, flow-graph node + drawer) and registers
// them with `@youneed/server-plugin-devtools`. Because the objects live in a
// (possibly remote) backend, the panel fetches the listing LIVE over the
// plugin's control routes via `ctx.request` rather than from the sync
// `inspect()`. Import this module (its import has the registration side effect)
// into the devtools web bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface StorageEntry {
  key: string;
  size: number;
  contentType?: string;
  updatedAt: number;
}
interface StorageInfo {
  kind: "storage";
  backend: string;
  endpoints: { list: string; object: string; put: string; delete: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-storage";

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// The interactive panel — fetches the live listing and drives put/delete.
@Component.define()
export class StoragePanel extends Component("server-storage-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    a.link { color: hsl(var(--primary)); }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: StorageInfo; ctx: DevtoolsContext } | null = null;

  #entries = this.signal<StorageEntry[]>([]);
  #prefix = this.signal("");
  #key = this.signal("");
  #text = this.signal("");
  #busy = this.signal(false);

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const url = this.#prefix().trim() ? `${d.info.endpoints.list}?prefix=${encodeURIComponent(this.#prefix().trim())}` : d.info.endpoints.list;
      const res = await d.ctx.request(url);
      const body = (await res.json()) as { entries?: StorageEntry[] };
      this.#entries.set(body.entries ?? []);
    } catch {
      /* server unreachable — leave the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  async #post(endpoint: string, body: unknown): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      await d.ctx.request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } finally {
      await this.#refresh();
    }
  }

  #put(): void {
    const key = this.#key().trim();
    if (!key) return;
    const text = this.#text();
    this.#key.set("");
    this.#text.set("");
    void this.#post(this.data!.info.endpoints.put, { key, text, contentType: "text/plain" });
  }

  #downloadHref(key: string): string {
    const d = this.data;
    if (!d) return "#";
    const path = `${d.info.endpoints.object}?key=${encodeURIComponent(key)}`;
    // Prefix the inspected server's origin so the link works for external targets.
    const origin = d.ctx.server?.url ? new URL(d.ctx.server.url).origin : "";
    return origin + path;
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const entries = this.#entries();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">objects (${entries.length})</span>
            <shad-badge variant="secondary">${info.backend}</shad-badge>
            <shad-input placeholder="prefix filter" .value=${this.#prefix()} @input=${(e: Event) => this.#prefix.set((e.target as HTMLInputElement).value)}></shad-input>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${entries.length
            ? html`<table>
                <tr><th>Key</th><th>Size</th><th>Type</th><th>Updated</th><th></th></tr>
                ${repeat(
                  entries,
                  (e) => e.key,
                  (e) => html`<tr>
                    <td class="name">${e.key}</td>
                    <td class="muted">${fmtSize(e.size)}</td>
                    <td class="muted">${e.contentType ?? "—"}</td>
                    <td class="muted">${e.updatedAt ? new Date(e.updatedAt).toLocaleString() : "—"}</td>
                    <td>
                      <a class="link" href=${this.#downloadHref(e.key)} target="_blank" rel="noopener">Download</a>
                      <shad-button size="sm" variant="ghost" @click=${() => this.#post(info.endpoints.delete, { key: e.key })}>✕</shad-button>
                    </td>
                  </tr>`,
                )}
              </table>`
            : html`<span class="muted">no objects — put one below</span>`}

          <shad-separator></shad-separator>
          <div class="muted">put a text object</div>
          <div class="row">
            <shad-input placeholder="key (e.g. notes/readme.txt)" .value=${this.#key()} @input=${(e: Event) => this.#key.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder="text contents" .value=${this.#text()} @input=${(e: Event) => this.#text.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#put()} ?disabled=${!this.#key().trim()}>put</shad-button>
          </div>
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "storage",
  label: "Storage",
  docs: DOCS,
  card(info, ctx): View {
    const s = info as StorageInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">storage</shad-badge> <span class="muted">${s.backend}</span></div>
      <div class="row"><a class="link" href="#/plugin/storage" @click=${() => ctx.goto("#/plugin/storage")}>open Storage →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-storage-panel .data=${{ info, ctx }}></server-storage-panel>`;
  },
  flowNode(info) {
    const s = info as StorageInfo;
    return { label: `Storage\n${s.backend}`, detail: { backend: s.backend, endpoints: s.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { backend?: string };
    return html`
      <span slot="title">Storage</span>
      <span slot="description">object store — backend: ${d.backend ?? "—"}</span>
      <div style="padding:1rem">
        <div class="muted">backend ${d.backend ?? "—"}</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/storage")}>Open Storage →</shad-button>
    `;
  },
});
