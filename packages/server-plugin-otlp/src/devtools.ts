// ── @youneed/server-plugin-otlp/devtools — this package's own devtools UI ─────
//
// The OTLP export status surface (Infra card, header-tab panel with exporter
// stats + a live recently-exported-spans table + a Flush button, flow-graph node
// + drawer), registered with `@youneed/server-plugin-devtools`. Import this module
// (its import has the registration side effect) into the devtools web bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface ExportedSpan {
  at: number;
  traceId: string;
  spanId: string;
  name: string;
  durationMs: number;
  error: boolean;
}
interface OtlpStats {
  endpoint: string;
  queued: number;
  batches: number;
  exported: number;
  failed: number;
  lastError?: string;
  recent: ExportedSpan[];
}
interface OtlpInfo {
  kind: "otlp";
  endpoint: string;
  endpoints: { stats: string; flush: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-otlp";

@Component.define()
export class OtlpPanel extends Component("server-otlp-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    .err { color: hsl(var(--destructive)); }
  `;

  @Component.prop() data: { info: OtlpInfo; ctx: DevtoolsContext } | null = null;

  #stats = this.signal<OtlpStats | null>(null);
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
      const res = await d.ctx.request(d.info.endpoints.stats);
      this.#stats.set((await res.json()) as OtlpStats);
    } catch {
      /* server unreachable — keep last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  async #flush(): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      await d.ctx.request(d.info.endpoints.flush, { method: "POST" });
    } finally {
      await this.#refresh();
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const s = this.#stats();
    const recent = s?.recent ?? [];
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row"><span class="name">OTLP exporter</span> <shad-badge variant="secondary">traces</shad-badge></div>
          <div class="row"><span class="muted">endpoint</span> <code>${info.endpoint}</code></div>
          ${s
            ? html`<div class="row">
                <shad-badge variant="outline">${s.exported} exported</shad-badge>
                <shad-badge variant="outline">${s.batches} batches</shad-badge>
                <shad-badge variant="secondary">${s.queued} queued</shad-badge>
                ${s.failed ? html`<shad-badge variant="destructive">${s.failed} failed</shad-badge>` : html``}
                ${s.lastError ? html`<span class="err muted">${s.lastError}</span>` : html``}
              </div>`
            : html`<div class="muted">loading…</div>`}
          <div class="row">
            <shad-button size="sm" @click=${() => this.#flush()} ?disabled=${this.#busy()}>Flush now</shad-button>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${recent.length
            ? html`<table>
                <tr><th>Span</th><th>Trace</th><th>Duration</th><th></th></tr>
                ${repeat(
                  recent,
                  (r) => r.spanId,
                  (r) => html`<tr>
                    <td class="name">${r.name}</td>
                    <td><code>${r.traceId.slice(0, 8)}…</code></td>
                    <td>${r.durationMs.toFixed(1)}ms</td>
                    <td>${r.error ? html`<shad-badge variant="destructive">error</shad-badge>` : html``}</td>
                  </tr>`,
                )}
              </table>`
            : html`<span class="muted">no spans exported yet — make some requests, then Flush</span>`}
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "otlp",
  label: "OTLP",
  docs: DOCS,
  card(info, ctx): View {
    const o = info as OtlpInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">otlp</shad-badge> <span class="muted">${o.endpoint}</span></div>
      <div class="row"><a class="link" href="#/plugin/otlp" @click=${() => ctx.goto("#/plugin/otlp")}>open OTLP →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-otlp-panel .data=${{ info, ctx }}></server-otlp-panel>`;
  },
  flowNode(info) {
    const o = info as OtlpInfo;
    return { label: `OTLP\n${o.endpoint.replace(/^https?:\/\//, "")}`, detail: { endpoint: o.endpoint } };
  },
  drawer(detail, ctx): View {
    const d = detail as { endpoint?: string };
    return html`
      <span slot="title">OTLP export</span>
      <span slot="description">traces → ${d.endpoint ?? "—"}</span>
      <div style="padding:1rem"><span class="muted">Per-request spans batched + shipped over OTLP/HTTP.</span></div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/otlp")}>Open OTLP →</shad-button>
    `;
  },
});
