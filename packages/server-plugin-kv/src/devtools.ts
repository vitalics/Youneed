// ── @youneed/server-plugin-kv/devtools — this package's own devtools UI ───────
//
// The KV package draws its OWN devtools surfaces (Infra card, header-tab panel
// with a live key browser, flow-graph node + drawer) and registers them with
// `@youneed/server-plugin-devtools`. devtools never special-cases "kv" — it just
// calls these. Import this module (its import has the registration side effect)
// into the devtools web bundle. Mirror of server-plugin-pubsub/devtools.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface KvOp {
  at: number;
  op: "get" | "set" | "delete" | "incr";
  key: string;
  hit?: boolean;
}
interface KvStat {
  gets: number;
  sets: number;
  deletes: number;
  incrs: number;
  hits: number;
  misses: number;
}
interface KvInfo {
  kind: "kv";
  backend: string;
  scannable: boolean;
  stats: KvStat;
  recent: KvOp[];
  endpoints: { keys: string; get: string; set: string; delete: string };
}
interface KvKeyInfo {
  key: string;
  ttl: number;
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-kv";

const hitRate = (s: KvStat): string => {
  const reads = s.hits + s.misses;
  return reads ? `${Math.round((s.hits / reads) * 100)}%` : "—";
};

const ttlLabel = (ttl: number): string => (ttl === -1 ? "∞" : ttl === -2 ? "—" : `${ttl}s`);

// The interactive panel — owns its form state, browses + mutates via `ctx.request`.
@Component.define()
export class KvPanel extends Component("server-kv-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .stats { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    .key { cursor: pointer; }
    .key:hover { text-decoration: underline; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: KvInfo; ctx: DevtoolsContext } | null = null;

  #keys = this.signal<KvKeyInfo[]>([]);
  #prefix = this.signal("");
  #key = this.signal("");
  #value = this.signal("");
  #ttl = this.signal("");
  #result = this.signal<{ ok: boolean; status: number } | null>(null);
  #loaded = this.signal(false);

  async #browse(): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      const url = `${d.info.endpoints.keys}?prefix=${encodeURIComponent(this.#prefix())}`;
      const res = await d.ctx.request(url);
      const json = (await res.json()) as { keys?: KvKeyInfo[] };
      this.#keys.set(json.keys ?? []);
      this.#loaded.set(true);
    } catch {
      this.#keys.set([]);
      this.#loaded.set(true);
    }
  }

  async #load(key: string): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      const res = await d.ctx.request(`${d.info.endpoints.get}?key=${encodeURIComponent(key)}`);
      const json = (await res.json()) as { value: string | null; ttl: number };
      this.#key.set(key);
      this.#value.set(json.value ?? "");
      this.#ttl.set(json.ttl > 0 ? String(json.ttl) : "");
    } catch {
      /* ignore */
    }
  }

  async #send(endpoint: string, body: unknown): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      const res = await d.ctx.request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      this.#result.set({ ok: res.ok, status: res.status });
      await this.#browse();
    } catch {
      this.#result.set({ ok: false, status: 0 });
    }
  }

  #save(): Promise<void> {
    const ttl = Number(this.#ttl());
    return this.#send(this.data!.info.endpoints.set, {
      key: this.#key(),
      value: this.#value(),
      ttl: ttl > 0 ? ttl : undefined,
    });
  }

  #remove(): Promise<void> {
    return this.#send(this.data!.info.endpoints.delete, { key: this.#key() });
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const s = info.stats;
    const result = this.#result();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">KV store</span> <shad-badge variant="secondary">${info.backend}</shad-badge>
          </div>
          <div class="stats muted">
            <span>${s.gets} get</span><span>${s.sets} set</span><span>${s.deletes} del</span>
            <span>${s.incrs} incr</span><span>hit-rate ${hitRate(s)}</span>
          </div>

          <shad-separator></shad-separator>
          <div class="muted">browse keys</div>
          <div class="row">
            <shad-input placeholder="prefix (optional)" .value=${this.#prefix()} @input=${(e: Event) => this.#prefix.set((e.target as HTMLInputElement).value)}></shad-input>
            <shad-button @click=${() => this.#browse()} ?disabled=${!info.scannable}>${info.scannable ? "scan" : "scan unsupported"}</shad-button>
          </div>
          ${this.#keys().length
            ? html`<table>
                <tr><th>Key</th><th>TTL</th></tr>
                ${repeat(
                  this.#keys(),
                  (k) => k.key,
                  (k) => html`<tr><td class="key name" @click=${() => this.#load(k.key)}>${k.key}</td><td class="muted">${ttlLabel(k.ttl)}</td></tr>`,
                )}
              </table>`
            : html`<span class="muted">${this.#loaded() ? "no keys" : "scan to list keys"}</span>`}

          <shad-separator></shad-separator>
          <div class="muted">edit a key</div>
          <div class="row">
            <shad-input placeholder="key" .value=${this.#key()} @input=${(e: Event) => this.#key.set((e.target as HTMLInputElement).value)}></shad-input>
            <shad-input placeholder="ttl (s, optional)" .value=${this.#ttl()} @input=${(e: Event) => this.#ttl.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder="value (string)" .value=${this.#value()} @input=${(e: Event) => this.#value.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#save()} ?disabled=${!this.#key()}>set</shad-button>
            <shad-button variant="destructive" @click=${() => this.#remove()} ?disabled=${!this.#key()}>delete</shad-button>
            ${result ? html`<shad-badge variant=${result.ok ? "secondary" : "destructive"}>${result.ok ? `ok (${result.status})` : `failed (${result.status})`}</shad-badge>` : html``}
          </div>
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "kv",
  label: "KV",
  docs: DOCS,
  card(info, ctx): View {
    const kv = info as KvInfo;
    const s = kv.stats;
    return html`
      <div class="row"><shad-badge variant="secondary">kv</shad-badge> <span class="muted">${kv.backend} · ${s.gets + s.sets} ops · hit-rate ${hitRate(s)}</span></div>
      <div class="row"><a class="link" href="#/plugin/kv" @click=${() => ctx.goto("#/plugin/kv")}>open KV →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-kv-panel .data=${{ info, ctx }}></server-kv-panel>`;
  },
  flowNode(info) {
    const kv = info as KvInfo;
    return { label: `KV\n${kv.backend}`, detail: { backend: kv.backend, stats: kv.stats, recent: kv.recent } };
  },
  drawer(detail, ctx): View {
    const d = detail as { backend?: string; stats?: KvStat; recent?: KvOp[] };
    const s = d.stats;
    const recent = d.recent ?? [];
    return html`
      <span slot="title">KV</span>
      <span slot="description">backend: ${d.backend ?? "—"}</span>
      <div style="padding:1rem">
        ${s ? html`<div class="muted">${s.gets} get · ${s.sets} set · ${s.deletes} del · hit-rate ${hitRate(s)}</div>` : html``}
        <div class="muted" style="margin-top:.5rem">recent ops</div>
        ${recent.length
          ? recent
              .slice(-10)
              .reverse()
              .map((o) => html`<div class="row"><shad-badge variant="outline">${o.op}</shad-badge> <span class="name">${o.key}</span>${o.op === "get" ? html` <span class="muted">${o.hit ? "hit" : "miss"}</span>` : html``}</div>`)
          : html`<span class="muted">no activity yet</span>`}
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/kv")}>Open KV →</shad-button>
    `;
  },
});
