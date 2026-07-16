// ── @youneed/server-plugin-mailer/devtools — this package's own devtools UI ───
//
// Draws the Mailer devtools surfaces (Infra card, header-tab panel with a live
// recent-sends table + a compose/send form, flow-graph node + drawer) and
// registers them with `@youneed/server-plugin-devtools`. Because sends accrue on
// the (possibly remote) server, the panel fetches them LIVE over the plugin's
// control routes via `ctx.request` rather than from the sync `inspect()`. Import
// this module (its import has the registration side effect) into the devtools bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface SendRecord {
  at: number;
  to: string;
  subject: string;
  ok: boolean;
  id?: string;
  error?: string;
}
interface MailerInfo {
  kind: "mailer";
  backend: string;
  sent: number;
  failed: number;
  recent: SendRecord[];
  endpoints: { recent: string; send: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-mailer";
const time = (at: number): string => new Date(at).toLocaleTimeString();

// The interactive panel — fetches live sends and drives the compose/send form.
@Component.define()
export class MailerPanel extends Component("server-mailer-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    .err { color: hsl(var(--destructive)); font-size: 0.8rem; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: MailerInfo; ctx: DevtoolsContext } | null = null;

  #sends = this.signal<SendRecord[]>([]);
  #to = this.signal("");
  #subject = this.signal("");
  #body = this.signal("");
  #busy = this.signal(false);
  #result = this.signal<{ ok: boolean; status: number } | null>(null);

  override connectedCallback(): void {
    super.connectedCallback();
    this.#sends.set(this.data?.info.recent ?? []);
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const res = await d.ctx.request(d.info.endpoints.recent);
      const json = (await res.json()) as { sends?: SendRecord[] };
      this.#sends.set(json.sends ?? []);
    } catch {
      /* server unreachable — leave the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  async #send(): Promise<void> {
    const d = this.data;
    if (!d) return;
    const to = this.#to().trim();
    const subject = this.#subject().trim();
    if (!to || !subject) return;
    try {
      const res = await d.ctx.request(d.info.endpoints.send, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, text: this.#body() }),
      });
      this.#result.set({ ok: res.ok, status: res.status });
      this.#subject.set("");
      this.#body.set("");
    } catch {
      this.#result.set({ ok: false, status: 0 });
    } finally {
      await this.#refresh();
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const sends = [...this.#sends()].reverse(); // newest first
    const result = this.#result();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">recent sends (${sends.length})</span>
            <shad-badge variant="secondary">${info.backend}</shad-badge>
            <span class="muted">${info.sent} sent · ${info.failed} failed</span>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${sends.length
            ? html`<table>
                <tr><th>To</th><th>Subject</th><th>Status</th><th>Time</th></tr>
                ${repeat(
                  sends,
                  (s, i) => `${s.at}:${i}`,
                  (s) => html`<tr>
                    <td class="name">${s.to}</td>
                    <td>${s.subject}</td>
                    <td>
                      <shad-badge variant=${s.ok ? "secondary" : "destructive"}>${s.ok ? "sent" : "failed"}</shad-badge>
                      ${s.error ? html`<span class="err">${s.error}</span>` : html``}
                    </td>
                    <td class="muted">${time(s.at)}</td>
                  </tr>`,
                )}
              </table>`
            : html`<span class="muted">no sends yet — compose one below</span>`}

          <shad-separator></shad-separator>
          <div class="muted">compose a message</div>
          <div class="row">
            <shad-input placeholder="to (address)" .value=${this.#to()} @input=${(e: Event) => this.#to.set((e.target as HTMLInputElement).value)}></shad-input>
            <shad-input placeholder="subject" .value=${this.#subject()} @input=${(e: Event) => this.#subject.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder="body (text)" .value=${this.#body()} @input=${(e: Event) => this.#body.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#send()} ?disabled=${!this.#to().trim() || !this.#subject().trim()}>send</shad-button>
            ${result ? html`<shad-badge variant=${result.ok ? "secondary" : "destructive"}>${result.ok ? `sent (${result.status})` : `failed (${result.status})`}</shad-badge>` : html``}
          </div>
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "mailer",
  label: "Mailer",
  docs: DOCS,
  card(info, ctx): View {
    const m = info as MailerInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">mailer</shad-badge> <span class="muted">${m.backend} · ${m.sent} sent · ${m.failed} failed</span></div>
      <div class="row"><a class="link" href="#/plugin/mailer" @click=${() => ctx.goto("#/plugin/mailer")}>open Mailer →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-mailer-panel .data=${{ info, ctx }}></server-mailer-panel>`;
  },
  flowNode(info) {
    const m = info as MailerInfo;
    return { label: `Mailer\n${m.backend}`, detail: { backend: m.backend, sent: m.sent, failed: m.failed, endpoints: m.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { backend?: string; sent?: number; failed?: number };
    return html`
      <span slot="title">Mailer</span>
      <span slot="description">transport: ${d.backend ?? "—"}</span>
      <div style="padding:1rem">
        <div class="muted">${d.sent ?? 0} sent · ${d.failed ?? 0} failed</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/mailer")}>Open Mailer →</shad-button>
    `;
  },
});
