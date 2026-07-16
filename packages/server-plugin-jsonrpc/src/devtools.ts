// ── @youneed/server-plugin-jsonrpc/devtools — this package's own devtools UI ───
//
// The JSON-RPC plugin draws its OWN devtools surfaces (Infra card, header-tab
// panel with a live request debugger, flow-graph node + drawer) and registers
// them with `@youneed/server-plugin-devtools`. Importing this module has the
// registration side effect; the devtools web bundle pulls it in.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface JsonRpcMethod {
  name: string;
  params: { name: string; type: string }[];
}
interface JsonRpcInfo {
  kind: "jsonrpc";
  transport: "post" | "ws";
  path: string;
  methods: JsonRpcMethod[];
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-jsonrpc";

/** Render a method's signature, e.g. `sum(number, number)`. */
function signature(m: JsonRpcMethod): string {
  return `${m.name}(${m.params.map((p) => p.type).join(", ")})`;
}

// The interactive panel — lists the method catalogue and debugs a call by POSTing
// a JSON-RPC envelope to the mount path via `ctx.request`.
@Component.define()
export class JsonRpcPanel extends Component("server-jsonrpc-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    pre { background: hsl(var(--muted)); padding: 0.75rem; border-radius: 6px; overflow: auto; font-size: 0.8rem; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: JsonRpcInfo; ctx: DevtoolsContext } | null = null;

  #method = this.signal("");
  #params = this.signal("[]");
  #response = this.signal<string | null>(null);
  #status = this.signal<{ ok: boolean; code: number } | null>(null);

  #pick(m: JsonRpcMethod): void {
    this.#method.set(m.name);
    // Seed the params box with a typed skeleton so the shape is obvious.
    this.#params.set(JSON.stringify(m.params.map((p) => sample(p.type))));
  }

  async #send(): Promise<void> {
    const d = this.data;
    if (!d) return;
    let params: unknown;
    try {
      params = JSON.parse(this.#params() || "[]");
    } catch {
      this.#response.set("params must be valid JSON (an array)");
      this.#status.set({ ok: false, code: 0 });
      return;
    }
    const envelope = { jsonrpc: "2.0", method: this.#method(), params, id: 1 };
    // The transport dictates HOW we call: a WS endpoint must be reached over a
    // WebSocket frame (POSTing to it 404s), a POST endpoint over fetch.
    if (d.info.transport === "ws") return this.#sendWs(d.info.path, envelope);
    return this.#sendPost(d.ctx, d.info.path, envelope);
  }

  async #sendPost(ctx: DevtoolsContext, path: string, envelope: unknown): Promise<void> {
    try {
      const res = await ctx.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
      });
      const text = await res.text();
      this.#show(text, { ok: res.ok, code: res.status });
    } catch {
      this.#response.set("request failed");
      this.#status.set({ ok: false, code: 0 });
    }
  }

  async #sendWs(path: string, envelope: unknown): Promise<void> {
    try {
      // Same-origin by default (devtools is served by the inspected server);
      // an external server provides its `url`.
      const serverUrl = this.data?.ctx.server?.url;
      const base = new URL(serverUrl ?? location.href);
      const proto = base.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${base.host}${path}`;
      const text = await new Promise<string>((resolve, reject) => {
        const sock = new WebSocket(url);
        const timer = setTimeout(() => {
          sock.close();
          reject(new Error("timeout (no response in 5s)"));
        }, 5000);
        sock.onopen = () => sock.send(JSON.stringify(envelope));
        sock.onmessage = (e) => {
          clearTimeout(timer);
          resolve(String(e.data));
          sock.close();
        };
        sock.onerror = () => {
          clearTimeout(timer);
          reject(new Error(`socket error (${url})`));
        };
      });
      this.#show(text, { ok: true, code: 101 });
    } catch (err) {
      this.#response.set(err instanceof Error ? err.message : "request failed");
      this.#status.set({ ok: false, code: 0 });
    }
  }

  /** Pretty-print a JSON response (raw text on a parse miss) + record the status. */
  #show(text: string, status: { ok: boolean; code: number }): void {
    try {
      this.#response.set(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      this.#response.set(text);
    }
    this.#status.set(status);
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const status = this.#status();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">methods (${info.methods.length})</span>
            <shad-badge variant="secondary">${info.transport}</shad-badge>
            <span class="muted mono">${info.path}</span>
          </div>
          ${info.methods.length
            ? html`<table>
                <tr><th>Method</th><th>Signature</th><th></th></tr>
                ${repeat(
                  info.methods,
                  (m) => m.name,
                  (m) => html`<tr>
                    <td class="name mono">${m.name}</td>
                    <td class="muted mono">${signature(m)}</td>
                    <td><shad-button size="sm" variant="outline" @click=${() => this.#pick(m)}>use</shad-button></td>
                  </tr>`,
                )}
              </table>`
            : html`<span class="muted">no methods registered</span>`}

          <shad-separator></shad-separator>
          <div class="muted">debug a call (over ${info.transport})</div>
          <div class="row">
            <shad-input placeholder="method" .value=${this.#method()} @input=${(e: Event) => this.#method.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder="params (JSON array)" .value=${this.#params()} @input=${(e: Event) => this.#params.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#send()} ?disabled=${!this.#method()}>send</shad-button>
            ${status ? html`<shad-badge variant=${status.ok ? "secondary" : "destructive"}>${status.ok ? `ok (${status.code})` : `error (${status.code})`}</shad-badge>` : html``}
          </div>
          ${this.#response() ? html`<pre>${this.#response()}</pre>` : html``}
        </div>
      </shad-card>
    `;
  }
}

/** A plausible sample value for a param type — seeds the debugger's params box. */
function sample(type: string): unknown {
  switch (type) {
    case "number":
    case "int":
    case "port":
      return 0;
    case "boolean":
      return false;
    case "json":
      return {};
    default:
      return "";
  }
}

registerDevtoolsRenderer({
  kind: "jsonrpc",
  label: "JSON-RPC",
  docs: DOCS,
  card(info, ctx): View {
    const j = info as JsonRpcInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">json-rpc</shad-badge> <span class="muted">${j.transport} · ${j.methods.length} method(s) · ${j.path}</span></div>
      <div class="row"><a class="link" href="#/plugin/jsonrpc" @click=${() => ctx.goto("#/plugin/jsonrpc")}>open JSON-RPC →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-jsonrpc-panel .data=${{ info, ctx }}></server-jsonrpc-panel>`;
  },
  flowNode(info) {
    const j = info as JsonRpcInfo;
    return { label: `JSON-RPC\n${j.transport} · ${j.methods.length} methods`, detail: { path: j.path, transport: j.transport, methods: j.methods } };
  },
  drawer(detail, ctx): View {
    const d = detail as { path?: string; transport?: string; methods?: JsonRpcMethod[] };
    const methods = d.methods ?? [];
    return html`
      <span slot="title">JSON-RPC</span>
      <span slot="description">${d.transport ?? "post"} · ${d.path ?? "/rpc"}</span>
      <div style="padding:1rem">
        <div class="muted">${methods.length} method(s)</div>
        ${methods.map((m) => html`<div class="row"><span class="name mono">${m.name}</span> <span class="muted mono">${signature(m)}</span></div>`)}
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/jsonrpc")}>Open JSON-RPC →</shad-button>
    `;
  },
});
