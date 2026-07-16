// ── @youneed/server-plugin-graphql/devtools — this package's own devtools UI ──
//
// Draws the GraphQL devtools surfaces (Infra card, header-tab panel with a mini
// query playground + SDL viewer + recent-ops table, flow-graph node + drawer) and
// registers them with `@youneed/server-plugin-devtools`. Because a plugin's live
// stats + SDL are fetched over its internal routes, the panel calls them LIVE via
// `ctx.request` rather than trusting only the sync `inspect()` snapshot. Import
// this module (its import has the registration side effect) into the devtools bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface RecordedOp {
  at: number;
  operationName: string;
  ok: boolean;
  ms: number;
  errors: string[];
}
interface GraphQLInfo {
  kind: "graphql";
  path: string;
  typeCount: number;
  queryCount: number;
  recent: RecordedOp[];
  sdl: string;
  endpoints: { execute: string; schema: string; stats: string; graphiql?: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-graphql";
type Tab = "query" | "schema" | "recent";

// The interactive panel — a mini playground, an SDL viewer and a recent-ops table.
@Component.define()
export class GraphQLPanel extends Component("server-graphql-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    pre { background: hsl(var(--muted)); padding: 0.75rem; border-radius: 6px; overflow: auto; font-size: 0.8rem; max-height: 22rem; }
    .err { color: hsl(var(--destructive)); }
    .ok { color: hsl(var(--muted-foreground)); }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: GraphQLInfo; ctx: DevtoolsContext } | null = null;

  #tab = this.signal<Tab>("query");
  #query = this.signal("{\n  __typename\n}\n");
  #variables = this.signal("");
  #result = this.signal("");
  #sdl = this.signal("");
  #recent = this.signal<RecordedOp[]>([]);
  #count = this.signal(0);
  #busy = this.signal(false);

  override connectedCallback(): void {
    super.connectedCallback();
    this.#sdl.set(this.data?.info.sdl ?? "");
    this.#recent.set(this.data?.info.recent ?? []);
    this.#count.set(this.data?.info.queryCount ?? 0);
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const [schemaRes, statsRes] = await Promise.all([
        d.ctx.request(d.info.endpoints.schema),
        d.ctx.request(d.info.endpoints.stats),
      ]);
      const schema = (await schemaRes.json()) as { sdl?: string };
      if (schema.sdl) this.#sdl.set(schema.sdl);
      const stats = (await statsRes.json()) as { count?: number; recent?: RecordedOp[] };
      this.#recent.set(stats.recent ?? []);
      this.#count.set(stats.count ?? 0);
    } catch {
      /* server unreachable — keep the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  async #run(): Promise<void> {
    const d = this.data;
    if (!d) return;
    let variables: unknown = undefined;
    const raw = this.#variables().trim();
    if (raw) {
      try {
        variables = JSON.parse(raw);
      } catch {
        this.#result.set("variables must be valid JSON");
        return;
      }
    }
    this.#busy.set(true);
    try {
      const res = await d.ctx.request(d.info.endpoints.execute, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: this.#query(), variables }),
      });
      const json = await res.json();
      this.#result.set(JSON.stringify(json, null, 2));
    } catch {
      this.#result.set("request failed");
    } finally {
      this.#busy.set(false);
      await this.#refresh();
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const tab = this.#tab();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">${info.path}</span>
            <shad-badge variant="secondary">${info.typeCount} types</shad-badge>
            <shad-badge variant="outline">${this.#count()} ops</shad-badge>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          <div class="row">
            <shad-button size="sm" variant=${tab === "query" ? "default" : "ghost"} @click=${() => this.#tab.set("query")}>Playground</shad-button>
            <shad-button size="sm" variant=${tab === "schema" ? "default" : "ghost"} @click=${() => this.#tab.set("schema")}>Schema</shad-button>
            <shad-button size="sm" variant=${tab === "recent" ? "default" : "ghost"} @click=${() => this.#tab.set("recent")}>Recent</shad-button>
          </div>

          ${tab === "query" ? this.#renderPlayground() : tab === "schema" ? this.#renderSchema() : this.#renderRecent()}
        </div>
      </shad-card>
    `;
  }

  #renderPlayground(): View {
    return html`
      <div class="muted">query</div>
      <shad-textarea placeholder="{ hello }" .value=${this.#query()} @input=${(e: Event) => this.#query.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
      <div class="muted">variables (JSON, optional)</div>
      <shad-textarea placeholder='{ "a": 1 }' .value=${this.#variables()} @input=${(e: Event) => this.#variables.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
      <div class="row">
        <shad-button @click=${() => this.#run()} ?disabled=${this.#busy() || !this.#query().trim()}>Run</shad-button>
      </div>
      ${this.#result() ? html`<pre>${this.#result()}</pre>` : html``}
    `;
  }

  #renderSchema(): View {
    const sdl = this.#sdl();
    return sdl ? html`<pre>${sdl}</pre>` : html`<span class="muted">no SDL available</span>`;
  }

  #renderRecent(): View {
    const recent = [...this.#recent()].reverse();
    return recent.length
      ? html`<table>
          <tr><th>Operation</th><th>Status</th><th>ms</th><th>Errors</th></tr>
          ${repeat(
            recent,
            (_, i) => i,
            (op) => html`<tr>
              <td class="name">${op.operationName}</td>
              <td class=${op.ok ? "ok" : "err"}>${op.ok ? "ok" : "error"}</td>
              <td>${op.ms}</td>
              <td class="err">${op.errors.join("; ")}</td>
            </tr>`,
          )}
        </table>`
      : html`<span class="muted">no operations yet — run one in the Playground</span>`;
  }
}

registerDevtoolsRenderer({
  kind: "graphql",
  label: "GraphQL",
  docs: DOCS,
  card(info, ctx): View {
    const g = info as GraphQLInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">graphql</shad-badge> <span class="muted">${g.path} · ${g.typeCount} types · ${g.queryCount} ops</span></div>
      <div class="row"><a class="link" href="#/plugin/graphql" @click=${() => ctx.goto("#/plugin/graphql")}>open GraphQL →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-graphql-panel .data=${{ info, ctx }}></server-graphql-panel>`;
  },
  flowNode(info) {
    const g = info as GraphQLInfo;
    return { label: `GraphQL\n${g.path}`, detail: { path: g.path, typeCount: g.typeCount, queryCount: g.queryCount, endpoints: g.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { path?: string; typeCount?: number; queryCount?: number };
    return html`
      <span slot="title">GraphQL</span>
      <span slot="description">endpoint: ${d.path ?? "—"}</span>
      <div style="padding:1rem">
        <div class="muted">${d.typeCount ?? 0} types · ${d.queryCount ?? 0} operations</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/graphql")}>Open GraphQL →</shad-button>
    `;
  },
});
