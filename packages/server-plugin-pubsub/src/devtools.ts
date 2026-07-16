// ── @youneed/server-plugin-pubsub/devtools — this package's own devtools UI ───
//
// The pub/sub package draws its OWN devtools surfaces (Infra card, header-tab
// panel with a message sender, flow-graph node + drawer) and registers them with
// `@youneed/server-plugin-devtools`. devtools never special-cases "pubsub" — it
// just calls these. Import this module (its import has the registration side
// effect) into the devtools web bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface PubSubChannel {
  channel: string;
  published: number;
  delivered: number;
  subscribers: number;
  recent: Array<{ at: number; message: string }>;
}
interface PubSubInfo {
  kind: "pubsub";
  backend: string;
  channels: PubSubChannel[];
  endpoints: { channels: string; publish: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-pubsub";

// The interactive panel — owns its form state and publishes via `ctx.request`.
@Component.define()
export class PubSubPanel extends Component("server-pubsub-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: PubSubInfo; ctx: DevtoolsContext } | null = null;

  #channel = this.signal("");
  #message = this.signal("");
  #result = this.signal<{ ok: boolean; status: number } | null>(null);

  async #send(): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      const res = await d.ctx.request(d.info.endpoints.publish, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: this.#channel(), message: this.#message() }),
      });
      this.#result.set({ ok: res.ok, status: res.status });
    } catch {
      this.#result.set({ ok: false, status: 0 });
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const result = this.#result();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row"><span class="name">channels (${info.channels.length})</span> <shad-badge variant="secondary">${info.backend}</shad-badge></div>
          ${info.channels.length
            ? html`<table>
                <tr><th>Channel</th><th>Subs</th><th>Published</th><th>Delivered</th><th>Last message</th></tr>
                ${repeat(
                  info.channels,
                  (c) => c.channel,
                  (c) => html`<tr><td class="name">${c.channel}</td><td>${c.subscribers}</td><td>${c.published}</td><td>${c.delivered}</td><td class="muted">${c.recent.at(-1)?.message ?? "—"}</td></tr>`,
                )}
              </table>`
            : html`<span class="muted">no channels yet — publish one below</span>`}

          <shad-separator></shad-separator>
          <div class="muted">send a message</div>
          <div class="row">
            <shad-input placeholder="channel" .value=${this.#channel()} @input=${(e: Event) => this.#channel.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder="message (string)" .value=${this.#message()} @input=${(e: Event) => this.#message.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#send()} ?disabled=${!this.#channel()}>publish</shad-button>
            ${result ? html`<shad-badge variant=${result.ok ? "secondary" : "destructive"}>${result.ok ? `sent (${result.status})` : `failed (${result.status})`}</shad-badge>` : html``}
          </div>
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "pubsub",
  label: "Pub/Sub",
  docs: DOCS,
  card(info, ctx): View {
    const ps = info as PubSubInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">pubsub</shad-badge> <span class="muted">${ps.backend} · ${ps.channels.length} channels</span></div>
      <div class="row"><a class="link" href="#/plugin/pubsub" @click=${() => ctx.goto("#/plugin/pubsub")}>open Pub/Sub →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-pubsub-panel .data=${{ info, ctx }}></server-pubsub-panel>`;
  },
  flowNode(info) {
    const ps = info as PubSubInfo;
    return { label: `Pub/Sub\n${ps.backend}`, detail: { backend: ps.backend, channels: ps.channels } };
  },
  drawer(detail, ctx): View {
    const d = detail as { backend?: string; channels?: PubSubChannel[] };
    const chans = d.channels ?? [];
    return html`
      <span slot="title">Pub/Sub</span>
      <span slot="description">backend: ${d.backend ?? "—"}</span>
      <div style="padding:1rem">
        <div class="muted">${chans.length} channel(s)</div>
        ${chans.map((c) => html`<div class="row"><span class="name">${c.channel}</span> <span class="muted">${c.published}↑ ${c.delivered}↓ · ${c.subscribers} subs</span></div>`)}
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/pubsub")}>Open Pub/Sub →</shad-button>
    `;
  },
});
