// ── @youneed/server-plugin-grpc/devtools — this package's own devtools UI ─────
//
// Draws the gRPC devtools surfaces (Infra card, header-tab panel, flow-graph
// node + drawer) and registers them with `@youneed/server-plugin-devtools`. The
// panel is live: a service/method tree (from `/services`), a call-count + recent
// calls table (from `/stats`), and a UNARY CALL TESTER (pick service + method,
// enter a JSON payload, Run → POST `/call` via `ctx.request`, render the JSON
// response/error). Because the counts live on the server, the panel fetches them
// over the plugin's routes via `ctx.request` rather than the sync `inspect()`.
// Import this module (its import has the registration side effect) into the
// devtools web bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface GrpcMethod {
  name: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  kind: "unary" | "server-stream" | "client-stream" | "bidi";
}
interface GrpcService {
  name: string;
  methods: GrpcMethod[];
}
interface GrpcCallRecord {
  method: string;
  at: number;
  ms: number;
  ok: boolean;
  error?: string;
}
interface GrpcInfo {
  kind: "grpc";
  host: string;
  port: number;
  services: GrpcService[];
  calls: number;
  endpoints: { services: string; stats: string; call: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-grpc";
const KIND_VARIANT: Record<string, string> = { unary: "default", "server-stream": "secondary", "client-stream": "secondary", bidi: "outline" };

// The interactive panel — service/method tree + stats + unary call tester.
@Component.define()
export class GrpcPanel extends Component("server-grpc-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .svc { font-weight: 600; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    .err { color: hsl(var(--destructive)); font-size: 0.8rem; }
    pre { background: hsl(var(--muted)); padding: 0.5rem; border-radius: 4px; overflow: auto; font-size: 0.8rem; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: GrpcInfo; ctx: DevtoolsContext } | null = null;

  #services = this.signal<GrpcService[]>([]);
  #calls = this.signal(0);
  #recent = this.signal<GrpcCallRecord[]>([]);
  #service = this.signal("");
  #method = this.signal("");
  #payload = this.signal("{}");
  #result = this.signal<{ ok: boolean; response?: unknown; error?: string } | null>(null);
  #busy = this.signal(false);

  override connectedCallback(): void {
    super.connectedCallback();
    const info = this.data?.info;
    if (info) {
      this.#services.set(info.services);
      if (info.services[0]) {
        this.#service.set(info.services[0].name);
        this.#method.set(info.services[0].methods[0]?.name ?? "");
      }
    }
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const [svcRes, statsRes] = await Promise.all([d.ctx.request(d.info.endpoints.services), d.ctx.request(d.info.endpoints.stats)]);
      const svc = (await svcRes.json()) as { services?: GrpcService[] };
      const stats = (await statsRes.json()) as { calls?: number; recent?: GrpcCallRecord[] };
      this.#services.set(svc.services ?? []);
      this.#calls.set(stats.calls ?? 0);
      this.#recent.set(stats.recent ?? []);
    } catch {
      /* server unreachable — leave the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  #methodsFor(service: string): GrpcMethod[] {
    return this.#services().find((s) => s.name === service)?.methods ?? [];
  }

  #onServiceChange(name: string): void {
    this.#service.set(name);
    this.#method.set(this.#methodsFor(name)[0]?.name ?? "");
  }

  async #run(): Promise<void> {
    const d = this.data;
    if (!d) return;
    let payload: unknown;
    try {
      payload = JSON.parse(this.#payload().trim() || "{}");
    } catch {
      this.#result.set({ ok: false, error: "payload is not valid JSON" });
      return;
    }
    this.#busy.set(true);
    this.#result.set(null);
    try {
      const res = await d.ctx.request(d.info.endpoints.call, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service: this.#service(), method: this.#method(), payload }),
      });
      const json = (await res.json()) as { ok?: boolean; response?: unknown; error?: string };
      this.#result.set({ ok: Boolean(json.ok), response: json.response, error: json.error });
    } catch (err) {
      this.#result.set({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.#busy.set(false);
      await this.#refresh();
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const services = this.#services();
    const methods = this.#methodsFor(this.#service());
    const recent = this.#recent();
    const result = this.#result();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">${info.host}:${info.port}</span>
            <shad-badge variant="secondary">${services.length} service(s)</shad-badge>
            <shad-badge variant="outline">${this.#calls()} calls</shad-badge>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${services.length
            ? repeat(
                services,
                (s) => s.name,
                (s) => html`
                  <div class="svc">${s.name}</div>
                  <table>
                    <tr><th>Method</th><th>Kind</th><th>Request</th><th>Response</th></tr>
                    ${repeat(
                      s.methods,
                      (m) => m.name,
                      (m) => html`<tr>
                        <td class="name">${m.name}</td>
                        <td><shad-badge variant=${KIND_VARIANT[m.kind] ?? "secondary"}>${m.kind}</shad-badge></td>
                        <td class="muted">${m.requestType}</td>
                        <td class="muted">${m.responseType}</td>
                      </tr>`,
                    )}
                  </table>
                `,
              )
            : html`<span class="muted">no services loaded</span>`}

          <shad-separator></shad-separator>
          <div class="muted">unary call tester</div>
          <div class="row">
            <shad-select .value=${this.#service()} @change=${(e: Event) => this.#onServiceChange((e.target as HTMLSelectElement).value)}>
              ${repeat(services, (s) => s.name, (s) => html`<option value=${s.name} ?selected=${s.name === this.#service()}>${s.name}</option>`)}
            </shad-select>
            <shad-select .value=${this.#method()} @change=${(e: Event) => this.#method.set((e.target as HTMLSelectElement).value)}>
              ${repeat(methods, (m) => m.name, (m) => html`<option value=${m.name} ?selected=${m.name === this.#method()}>${m.name}</option>`)}
            </shad-select>
          </div>
          <shad-textarea placeholder="payload (JSON)" .value=${this.#payload()} @input=${(e: Event) => this.#payload.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#run()} ?disabled=${this.#busy() || !this.#service() || !this.#method()}>Run</shad-button>
            ${result ? html`<shad-badge variant=${result.ok ? "secondary" : "destructive"}>${result.ok ? "ok" : "error"}</shad-badge>` : html``}
          </div>
          ${result
            ? result.ok
              ? html`<pre>${JSON.stringify(result.response, null, 2)}</pre>`
              : html`<div class="err">${result.error ?? "call failed"}</div>`
            : html``}

          ${recent.length
            ? html`
                <shad-separator></shad-separator>
                <div class="muted">recent calls</div>
                <table>
                  <tr><th>Method</th><th>Status</th><th>ms</th><th>Detail</th></tr>
                  ${repeat(
                    recent,
                    (_, i) => String(i),
                    (r) => html`<tr>
                      <td class="name">${r.method}</td>
                      <td><shad-badge variant=${r.ok ? "secondary" : "destructive"}>${r.ok ? "ok" : "error"}</shad-badge></td>
                      <td>${r.ms}</td>
                      <td class="err">${r.error ?? ""}</td>
                    </tr>`,
                  )}
                </table>
              `
            : html``}
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "grpc",
  label: "gRPC",
  docs: DOCS,
  card(info, ctx): View {
    const g = info as GrpcInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">grpc</shad-badge> <span class="muted">${g.host}:${g.port} · ${g.services.length} service(s)</span></div>
      <div class="row"><a class="link" href="#/plugin/grpc" @click=${() => ctx.goto("#/plugin/grpc")}>open gRPC →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-grpc-panel .data=${{ info, ctx }}></server-grpc-panel>`;
  },
  flowNode(info) {
    const g = info as GrpcInfo;
    return { label: `gRPC\n${g.host}:${g.port}`, detail: { host: g.host, port: g.port, services: g.services, endpoints: g.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { host?: string; port?: number; services?: GrpcService[] };
    const svcs = d.services ?? [];
    return html`
      <span slot="title">gRPC</span>
      <span slot="description">${d.host ?? "—"}:${d.port ?? "—"}</span>
      <div style="padding:1rem">
        <div class="muted">${svcs.length} service(s)</div>
        ${svcs.map((s) => html`<div class="row"><span class="name">${s.name}</span> <span class="muted">${s.methods.length} method(s)</span></div>`)}
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/grpc")}>Open gRPC →</shad-button>
    `;
  },
});
